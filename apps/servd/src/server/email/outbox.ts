import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import { renderAccountEmail } from "@/lib/email/render";
import { getEmailCreds, sendBatch, type OutgoingEmail } from "./provider";
import { renderInvite } from "@/server/partners/invite-email";

/**
 * The thing that finally drains `outbound_emails`.
 *
 * Rows have been queued since H3 — partner welcomes, then the daily digest,
 * then the four A7 notifications — and nothing has ever taken them out. The
 * queue existed because `CREDENTIALS_ENCRYPTION_KEY` was unset and Resend's key
 * could not even be stored; that is no longer true, so this is the other half.
 *
 * CLAIM BEFORE SEND, NOT AFTER. `attempts` is incremented in its own committed
 * statement before the batch goes to Resend. If this function dies between the
 * send and the bookkeeping, the row is left with a burnt attempt rather than
 * queued-and-unsent — so the worst case is one lost email rather than a row
 * that resends on every run until somebody notices. There is no idempotency key
 * on Resend's batch endpoint to do better with, and a duplicate storm to a
 * partner's inbox is worse than a gap.
 */

/** Resend's batch limit, and the most one cron tick will do. */
const BATCH = 100;

/**
 * After this many failed attempts a row is parked, not retried forever.
 *
 * Five, because the failures that resolve themselves — a timeout, a 429, a
 * brief outage — resolve well inside five daily-ish ticks, and the ones that do
 * not are a bad address or a rejected domain, which retrying cannot fix. A
 * parked row keeps its `error`, so what went wrong is still readable.
 */
const MAX_ATTEMPTS = 5;

export interface DrainResult {
  configured: boolean;
  claimed: number;
  sent: number;
  failed: number;
  parked: number;
  /** Distinct provider errors seen, for the cron record. Never a key or a token. */
  errors: string[];
}

interface QueuedRow {
  id: string;
  template: string;
  toEmail: string;
  toName: string | null;
  payload: unknown;
  partnerId: string | null;
  attempts: number;
}

/**
 * Render one queued row into something sendable.
 *
 * Returns null for a template this release does not know. A row for a template
 * added later and deployed earlier must not be marked failed — it is not
 * broken, it is early — so it is skipped and picked up by the deploy that knows
 * it.
 */
export function renderQueued(row: QueuedRow, appUrl: string): OutgoingEmail | null {
  const p = (row.payload ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
  const greeting = row.toName ? `Hi ${row.toName},` : "Hi,";

  // Everything the notifier and the digest queue carries its own composed copy.
  // The composer decided what to say on the day; re-deriving it here weeks
  // later would send whatever this release thinks rather than what was decided.
  //
  // Checked AFTER the named templates below would be wrong: a row carrying both
  // a composed body and a template of its own should render as its template.
  // In practice only the notifier writes subject/body, so this is the general
  // case and the named ones are the exceptions above it.
  if (row.template !== "partner.invite" && str("subject") && str("body")) {
    return {
      to: row.toEmail,
      subject: str("subject"),
      ...renderAccountEmail([greeting, ...str("body").split("\n\n")]),
    };
  }

  if (row.template === "partner.invite") {
    // The only template whose payload has to be decrypted before it can be
    // rendered — see invite-email.ts for why the token is in there at all.
    // A null here means the row was written under a different encryption key
    // and can never become a working link; skipping leaves it queued and
    // visible rather than sending somebody a dead one.
    const invite = renderInvite(p, appUrl);
    if (!invite) return null;
    return {
      to: row.toEmail,
      subject: invite.subject,
      ...renderAccountEmail([greeting, ...invite.paragraphs]),
    };
  }

  if (row.template === "partner.welcome") {
    const territory = str("territory");
    const share = typeof p.revenueSharePct === "number" ? p.revenueSharePct : null;
    return {
      to: row.toEmail,
      subject: `Welcome to CANVEXIA${territory ? ` — ${territory}` : ""}`,
      ...renderAccountEmail([
        greeting,
        `Your CANVEXIA partner account is approved${
          territory ? ` for ${territory}` : ""
        }.`,
        share === null
          ? "Sign in to set up your brand and open your first merchant."
          : `You keep ${share}% of what each merchant pays every month.`,
        // The invite LINK is deliberately not here. The payload carries no
        // token — that was the point of queueing the row without one — and
        // composing one now would mean minting a fresh invite from a cron,
        // which is not a thing this codebase does. The sign-in page is enough
        // for somebody who has already been sent an invitation.
        `Sign in: ${appUrl}/partner/login`,
      ]),
    };
  }

  return null;
}

/**
 * Send one batch of queued email.
 *
 * DOES NOTHING WITHOUT CREDENTIALS, and says so rather than failing rows. A
 * deployment with no Resend key configured should accumulate a queue, not a
 * pile of permanently-failed rows that somebody has to un-fail by hand.
 */
export async function drainOutbox(
  appUrl: string,
  /**
   * Restrict the run to specific rows.
   *
   * For the one email somebody is standing there waiting for — a staff
   * invitation — so it goes out in the same request rather than on the next
   * fifteen-minute tick. It is the SAME sending path, claim and all; the only
   * difference is which rows it looks at.
   */
  opts: { onlyIds?: string[] } = {},
): Promise<DrainResult> {
  const creds = await getEmailCreds();
  if (!creds?.apiKey || !creds.fromEmail) {
    return { configured: false, claimed: 0, sent: 0, failed: 0, parked: 0, errors: [] };
  }

  let rows: QueuedRow[] = [];
  try {
    rows = await systemDb((tx) =>
      tx.outboundEmail.findMany({
        where: {
          sentAt: null,
          failedAt: null,
          attempts: { lt: MAX_ATTEMPTS },
          ...(opts.onlyIds ? { id: { in: opts.onlyIds } } : {}),
        },
        orderBy: { createdAt: "asc" },
        take: BATCH,
        select: {
          id: true,
          template: true,
          toEmail: true,
          toName: true,
          payload: true,
          partnerId: true,
          attempts: true,
        },
      }),
    );
  } catch {
    return { configured: true, claimed: 0, sent: 0, failed: 0, parked: 0, errors: [] };
  }
  if (rows.length === 0) {
    return { configured: true, claimed: 0, sent: 0, failed: 0, parked: 0, errors: [] };
  }

  const renderable: { row: QueuedRow; email: OutgoingEmail }[] = [];
  for (const row of rows) {
    const email = renderQueued(row, appUrl);
    if (email) renderable.push({ row, email });
  }
  if (renderable.length === 0) {
    return { configured: true, claimed: 0, sent: 0, failed: 0, parked: 0, errors: [] };
  }

  // THE CLAIM. Committed before the send, so a crash mid-flight burns an
  // attempt instead of leaving a row that resends every tick.
  await systemDb((tx) =>
    tx.outboundEmail.updateMany({
      where: { id: { in: renderable.map((r) => r.row.id) } },
      data: { attempts: { increment: 1 } },
    }),
  );

  const outcomes = await sendBatch(
    creds,
    renderable.map((r) => r.email),
  );

  const now = new Date();
  let sent = 0;
  let failed = 0;
  let parked = 0;
  const errors = new Set<string>();

  for (let i = 0; i < renderable.length; i++) {
    const { row } = renderable[i];
    const outcome = outcomes[i];
    try {
      if (outcome?.ok) {
        await systemDb((tx) =>
          tx.outboundEmail.update({
            where: { id: row.id },
            data: { sentAt: now, error: null },
            select: { id: true },
          }),
        );
        sent += 1;
      } else {
        const message = (outcome?.error ?? "Send failed").slice(0, 300);
        errors.add(message);
        // The attempt was already counted by the claim above, so the row is
        // parked once this attempt is its fifth.
        const exhausted = row.attempts + 1 >= MAX_ATTEMPTS;
        await systemDb((tx) =>
          tx.outboundEmail.update({
            where: { id: row.id },
            data: { error: message, ...(exhausted ? { failedAt: now } : {}) },
            select: { id: true },
          }),
        );
        failed += 1;
        if (exhausted) parked += 1;
      }
    } catch {
      // The mail went out; only the bookkeeping failed. Counted as sent,
      // because it was — the row will be retried and may duplicate, which is
      // the one case this design cannot avoid and is why it is recorded.
      errors.add("bookkeeping failed after send");
    }
  }

  return { configured: true, claimed: renderable.length, sent, failed, parked, errors: [...errors] };
}
