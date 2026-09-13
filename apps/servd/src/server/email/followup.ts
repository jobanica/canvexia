import "server-only";

import { randomBytes } from "node:crypto";
import { systemDb } from "@/server/tenancy/scoped-db";
import { renderEmail, buildRecipientLinks } from "@/lib/email/render";
import { computeSchedule, stepDef, ALL_STEPS, type Track } from "@/lib/email/tracks";
import { decideSend } from "@/lib/email/suppression";
import { DEFAULT_COPY } from "@/lib/email/default-copy";
import { getEmailCreds, sendBatch } from "./provider";

/**
 * The acquisition follow-up engine.
 *
 * SCOPE, and it is the whole design: this emails UN-ACTIVATED LEADS ONLY.
 * The instant someone pays, every unsent step is cancelled and they never hear
 * from this system again — lifecycle after activation is in-app, by design.
 * Emailing "activate your restaurant!" to someone who paid yesterday is the
 * single worst thing this code could do, so it is guarded twice: at scheduling
 * time, and again at send time, because the state changes in between.
 *
 * Two tracks:
 *   A — gave an email, hasn't reached a preview → "come back and finish"
 *   B — reached a preview, hasn't paid          → "activate for ₱499"
 *
 * Reaching a preview cancels the rest of A and schedules B.
 */

// ---------------------------------------------------------------------------
// Templates — the words. The schedule lives in lib/email/tracks.ts.
// ---------------------------------------------------------------------------

export interface Template {
  stepKey: string;
  subject: string;
  body: string;
  enabled: boolean;
}

/** Every step's copy, seeding any that don't exist yet from the defaults. */
export async function getTemplates(): Promise<Map<string, Template>> {
  const out = new Map<string, Template>();
  try {
    const rows = await systemDb((tx) =>
      tx.emailTemplate.findMany({
        select: { stepKey: true, subject: true, body: true, enabled: true },
      }),
    );
    for (const r of rows) out.set(r.stepKey, r);

    // Seed anything missing so a fresh install has a working sequence rather
    // than eleven blank steps to fill in by hand.
    const missing = ALL_STEPS.filter((s) => !out.has(s.key) && DEFAULT_COPY[s.key]);
    for (const s of missing) {
      const copy = DEFAULT_COPY[s.key];
      try {
        await systemDb((tx) =>
          tx.emailTemplate.create({
            data: { stepKey: s.key, subject: copy.subject, body: copy.body },
            select: { id: true },
          }),
        );
      } catch {
        /* raced with another request — the read below still gets it */
      }
      out.set(s.key, { stepKey: s.key, ...copy, enabled: true });
    }
  } catch {
    // Tables not migrated yet — fall back to the defaults so previews of the
    // sequence still render.
    for (const s of ALL_STEPS) {
      const copy = DEFAULT_COPY[s.key];
      if (copy) out.set(s.key, { stepKey: s.key, ...copy, enabled: true });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Entering a track
// ---------------------------------------------------------------------------

/**
 * Put a lead into a track, writing every step's row up front so the whole
 * sequence is inspectable before any of it goes out. Steps that already exist
 * are left alone — the unique (restaurant, step) pair means enrolling twice is
 * a no-op rather than a duplicate.
 */
async function schedule(restaurantId: string, track: Track, anchor: Date): Promise<number> {
  const planned = computeSchedule(track, anchor);
  let written = 0;
  for (const p of planned) {
    try {
      await systemDb((tx) =>
        tx.emailSend.create({
          data: {
            restaurantId,
            track: p.track,
            stepKey: p.stepKey,
            sendAt: p.sendAt,
          },
          select: { id: true },
        }),
      );
      written++;
    } catch {
      /* already scheduled */
    }
  }
  return written;
}

/**
 * Called the moment an email is captured on the builder. Auto-subscribe is the
 * point: no checkbox, no confirmation step — they asked us to save their work,
 * and the follow-up is how we do that.
 */
export async function enrolTrackA(restaurantId: string, anchor = new Date()): Promise<void> {
  try {
    await schedule(restaurantId, "A", anchor);
  } catch {
    /* never block the builder on follow-up scheduling */
  }
}

/**
 * Called when a lead first sees their preview. Cancels whatever is left of
 * Track A — they've done the thing A was asking for, so continuing to ask
 * would be both useless and slightly insulting — and starts Track B.
 */
export async function moveToTrackB(restaurantId: string, anchor = new Date()): Promise<void> {
  try {
    await systemDb((tx) =>
      tx.emailSend.updateMany({
        where: { restaurantId, track: "A", status: "scheduled" },
        data: { status: "skipped", skipReason: "moved_to_B" },
      }),
    );
    await schedule(restaurantId, "B", anchor);
  } catch {
    /* not migrated yet */
  }
}

/**
 * Called from the verified Xendit activation. THE critical suppression hook:
 * every unsent step, on either track, is cancelled permanently.
 */
export async function suppressOnActivation(restaurantId: string): Promise<void> {
  try {
    await systemDb((tx) =>
      tx.emailSend.updateMany({
        where: { restaurantId, status: "scheduled" },
        data: { status: "skipped", skipReason: "activated" },
      }),
    );
  } catch {
    /* not migrated yet */
  }
}

/** Called from the unsubscribe link. Stops everything still queued. */
export async function suppressOnUnsubscribe(restaurantId: string): Promise<void> {
  try {
    await systemDb((tx) =>
      tx.emailSend.updateMany({
        where: { restaurantId, status: "scheduled" },
        data: { status: "skipped", skipReason: "unsubscribed" },
      }),
    );
  } catch {
    /* not migrated yet */
  }
}

// ---------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------

export interface RunReport {
  enabled: boolean;
  due: number;
  sent: number;
  skipped: number;
  failed: number;
  bySkipReason: Record<string, number>;
}

const MAX_ATTEMPTS = 3;
const BATCH = 60; // per cron pass — keeps a run comfortably inside its timeout
/** How long a claimed-but-unfinished send is left before another pass retries it. */
const CLAIM_STALE_MS = 10 * 60_000;

/**
 * Send everything that's due. Run every 15 minutes.
 *
 * The suppression check happens HERE, not only when the send was scheduled —
 * a step scheduled seven days ago is being evaluated against who this person
 * is today, which is the only way "don't email someone who just paid" can
 * actually hold.
 */
export async function runFollowUps(now = new Date()): Promise<RunReport> {
  const report: RunReport = {
    enabled: false,
    due: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    bySkipReason: {},
  };

  let dueSends: {
    id: string;
    restaurantId: string;
    track: string;
    stepKey: string;
    attempts: number;
  }[];
  try {
    const setting = await systemDb((tx) =>
      tx.platformSetting.findUnique({
        where: { id: "platform" },
        select: { emailAutomationOn: true },
      }),
    );
    report.enabled = !!setting?.emailAutomationOn;
    if (!report.enabled) return report;

    // Recover anything a crashed or timed-out pass left mid-flight. `sentAt` is
    // stamped at claim time, so it doubles as "when did someone take this".
    await systemDb((tx) =>
      tx.emailSend.updateMany({
        where: { status: "sending", sentAt: { lt: new Date(now.getTime() - CLAIM_STALE_MS) } },
        data: { status: "scheduled", sentAt: null },
      }),
    );

    dueSends = await systemDb((tx) =>
      tx.emailSend.findMany({
        where: { status: "scheduled", sendAt: { lte: now }, attempts: { lt: MAX_ATTEMPTS } },
        orderBy: { sendAt: "asc" },
        take: BATCH,
        select: { id: true, restaurantId: true, track: true, stepKey: true, attempts: true },
      }),
    );
  } catch {
    return report; // not migrated yet
  }

  report.due = dueSends.length;
  if (dueSends.length === 0) return report;

  const creds = await getEmailCreds();
  const templates = await getTemplates();
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const skip = async (id: string, reason: string) => {
    report.skipped++;
    report.bySkipReason[reason] = (report.bySkipReason[reason] ?? 0) + 1;
    try {
      await systemDb((tx) =>
        tx.emailSend.updateMany({
          where: { id, status: "scheduled" },
          data: { status: "skipped", skipReason: reason },
        }),
      );
    } catch {
      /* best-effort */
    }
  };

  for (const send of dueSends) {
    const template = templates.get(send.stepKey);

    // Re-read the lead NOW. The decision below runs against current state
    // rather than the state at scheduling time — that's the only way "don't
    // email someone who just paid" can actually hold for a step queued a week
    // ago. A read failure defers rather than burning the step.
    let lead;
    try {
      lead = await systemDb((tx) =>
        tx.restaurant.findUnique({
          where: { id: send.restaurantId },
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            buildToken: true,
            contactEmail: true,
            emailOptOut: true,
            unsubToken: true,
            previewReachedAt: true,
          },
        }),
      );
    } catch {
      continue;
    }

    const decision = decideSend(send, { template, lead, configured: !!creds });
    if (!decision.send) {
      if ("skip" in decision) await skip(send.id, decision.skip);
      continue; // a `defer` leaves the row scheduled for the next pass
    }
    // decideSend has already refused a missing template, a null lead, an empty
    // address and an unconfigured provider. This restates that for the type
    // checker rather than scattering non-null assertions down the send path.
    if (!template || !lead || !creds) continue;
    const to = lead.contactEmail!.trim();

    // Every marketing email needs a live unsubscribe link.
    let token = lead.unsubToken;
    if (!token) {
      token = randomBytes(18).toString("base64url");
      try {
        await systemDb((tx) =>
          tx.restaurant.update({
            where: { id: lead.id },
            data: { unsubToken: token },
            select: { id: true },
          }),
        );
      } catch {
        continue;
      }
    }

    // CLAIM the row before sending, not after. The status guard means exactly
    // one pass can move it out of `scheduled`, so two overlapping cron runs
    // that both saw this step can't both put it in someone's inbox. Losing the
    // race is normal, not an error — the winner is sending it right now.
    let claimed = false;
    try {
      const res = await systemDb((tx) =>
        tx.emailSend.updateMany({
          where: { id: send.id, status: "scheduled" },
          data: { status: "sending", sentAt: new Date(), attempts: send.attempts + 1 },
        }),
      );
      claimed = res.count === 1;
    } catch {
      /* treated as unclaimed below */
    }
    if (!claimed) continue;

    const release = async (data: Record<string, unknown>) => {
      try {
        await systemDb((tx) => tx.emailSend.updateMany({ where: { id: send.id }, data }));
      } catch {
        /* the counters above still reflect what happened */
      }
    };

    const links = buildRecipientLinks(base, lead);
    const { text, html } = renderEmail(
      template.body,
      { name: lead.name, email: to, ...links },
      `${base}/unsubscribe/${token}`,
    );
    const [outcome] = await sendBatch(creds, [
      { to, subject: template.subject, text, html },
    ]);

    if (outcome?.ok) {
      report.sent++;
      await release({ status: "sent", sentAt: new Date(), error: null });
    } else {
      // Retry a couple of times before giving up — a provider blip shouldn't
      // cost someone their step, but nor should it retry forever. Back to
      // `scheduled` so the next pass picks it up; the attempt was already
      // counted at claim time.
      const attempts = send.attempts + 1;
      report.failed++;
      await release({
        status: attempts >= MAX_ATTEMPTS ? "failed" : "scheduled",
        sentAt: null,
        error: outcome?.error?.slice(0, 300) ?? "send failed",
      });
    }
  }

  return report;
}

export { ALL_STEPS, stepDef };
