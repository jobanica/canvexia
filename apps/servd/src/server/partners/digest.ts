import "server-only";
import { composeDigest, DIGEST_EVENTS, type DigestFacts } from "@servd/db";
import { ladderProgress, parseMilestones } from "@servd/core";
import { partnerDb, systemDb } from "@/server/tenancy/scoped-db";
import { buildAttention } from "@/lib/partners/attention";
import { VISIT_RADIUS_METERS } from "@/lib/partners/geo";
import { listPartnerMerchants, type PartnerMerchant } from "./merchants";
import { startOfManilaDay } from "@/lib/orders/order-number";

/**
 * The daily partner digest: gather the facts, compose, QUEUE.
 *
 * `composeDigest` has existed since A5 with a test file and nothing calling it.
 * This is what calls it.
 *
 * QUEUED, NOT SENT, and that is not a shortcut. Resend's API key lives in
 * `platform_settings.emailCredsEnc`, decrypted with `CREDENTIALS_ENCRYPTION_KEY`,
 * which is unset on every deployment of this project — so nothing in this
 * codebase can put an email on the wire today. The choice is therefore between
 * a job that does nothing at all and one that writes the row a sender will
 * drain the day that key exists. `outbound_emails` already exists for exactly
 * this reason and already holds the partner welcome emails.
 *
 * The difference matters operationally: a queued row is VISIBLE. `cron_runs`
 * records that the job fired and how many digests it produced, so "the digest
 * is not going out" and "the digest has nothing to say" stop looking identical.
 */

/** Settlement kinds — money that arrived, as opposed to a hand-made adjustment. */
const SETTLEMENT_KINDS = ["subscription", "addon", "feature", "activation"];

/**
 * "Yesterday" in Manila, as the pair of UTC instants bounding it.
 *
 * Vercel Cron is UTC-only and Manila is UTC+8 with no DST, so "now minus 24
 * hours" is the wrong window on both ends — it slides with the firing time and
 * straddles two Manila days. The freeze-statements job was one hour and one
 * MONTH out of place for exactly this reason before it was fixed; this computes
 * the boundary rather than approximating it.
 */
export function manilaYesterday(asOf: Date): { from: Date; to: Date } {
  const to = startOfManilaDay(asOf);
  return { from: new Date(to.getTime() - 24 * 60 * 60 * 1000), to };
}

/**
 * Everything one partner's digest is composed from.
 *
 * Deliberately NOT `getPartnerOverview()`, although it computes three of these.
 * The overview also builds a six-month growth series and a full merchant list
 * for the screen, and this runs once per partner in a loop at 23:00 UTC. It
 * reuses the two PURE functions that hold the judgement — `buildAttention` and
 * `ladderProgress` — which are the parts that must not diverge between the
 * dashboard and the email.
 */
export async function buildDigestFacts(
  partnerId: string,
  partnerName: string,
  asOf: Date,
  /**
   * A7: include yesterday's field work.
   *
   * Only for a recipient who manages the team. A salesperson's digest must not
   * carry a list of who else did not check in — that is their manager's
   * business and not theirs, and the permission grid says so.
   */
  opts: { includeTeam?: boolean } = {},
): Promise<DigestFacts> {
  const { from, to } = manilaYesterday(asOf);

  const merchants = await listPartnerMerchants(partnerId);
  // `merchantId` on a ledger row is unique only WITHIN a product (D29), so the
  // lookup is keyed on both. A row whose merchant has since been reassigned to
  // another partner falls through to the id, which is honest — the payment is
  // still theirs, the name is no longer ours to state.
  const nameOf = new Map(merchants.map((m: PartnerMerchant) => [`${m.productId}:${m.id}`, m.name]));

  const [partner, prospects, payments] = await partnerDb(partnerId, async (tx) =>
    Promise.all([
      tx.partner.findFirst({
        select: { milestones: true, licenseStartedAt: true },
      }),
      tx.prospect
        .findMany({
          where: {
            stage: { notIn: ["paid", "lost"] },
            nextFollowUpAt: { not: null, lte: asOf },
          },
          select: { businessName: true, nextFollowUpAt: true },
        })
        .catch(() => [] as { businessName: string; nextFollowUpAt: Date | null }[]),
      tx.partnerLedgerEntry
        .findMany({
          where: {
            kind: { in: SETTLEMENT_KINDS },
            occurredAt: { gte: from, lt: to },
          },
          select: { productId: true, merchantId: true, grossAmount: true },
          orderBy: { occurredAt: "asc" },
        })
        .catch(() => [] as { productId: string; merchantId: string; grossAmount: number }[]),
    ]),
  );

  const attention = buildAttention(
    merchants.map((m: PartnerMerchant) => ({
      id: m.id,
      productId: m.productId,
      name: m.name,
      subscriptionStatus: m.subscriptionStatus,
      trialEndsAt: m.trialEndsAt,
      lastOrderAt: m.lastOrderAt,
      createdAt: m.createdAt,
    })),
    // Prospect follow-ups get their own section in the digest, so they are left
    // out of the attention list here — otherwise every overdue prospect is
    // counted twice and the subject line says so.
    [],
    asOf,
  );

  const ladder = ladderProgress(
    parseMilestones(partner?.milestones),
    // Paying is what a milestone counts, and `isPaying` is the dashboard's own
    // rule: active or past_due. Trials do not count toward a target.
    merchants.filter((m: PartnerMerchant) =>
      m.subscriptionStatus === "active" || m.subscriptionStatus === "past_due",
    ).length,
    partner?.licenseStartedAt ?? null,
    asOf,
  );

  return {
    partnerName,
    followUpsDue: prospects.map((p) => ({
      businessName: p.businessName,
      overdueDays: p.nextFollowUpAt
        ? Math.max(0, Math.floor((to.getTime() - p.nextFollowUpAt.getTime()) / 86_400_000))
        : 0,
    })),
    attention: attention.map((a) => ({ title: a.title, detail: a.detail })),
    // A trial that STARTED yesterday, by the merchant's own creation date in
    // the Manila window — not by `trialEndsAt` arithmetic, which would move if
    // anyone ever extends a trial.
    newTrials: merchants
      .filter(
        (m: PartnerMerchant) =>
          m.subscriptionStatus === "trialing" && m.createdAt >= from && m.createdAt < to,
      )
      .map((m: PartnerMerchant) => m.name),
    newPayments: payments.map((p) => ({
      merchant: nameOf.get(`${p.productId}:${p.merchantId}`) ?? p.merchantId,
      amountCentavos: p.grossAmount,
    })),
    team: opts.includeTeam ? await teamYesterday(partnerId, from, to) : undefined,
    milestone: ladder.current
      ? {
          target: ladder.current.target,
          actual: ladder.current.actual,
          month: ladder.current.month,
          atRisk: ladder.current.status === "at_risk" || ladder.current.status === "missed",
        }
      : null,
  };
}

/**
 * Yesterday's field work, per active seat.
 *
 * Read with `systemDb` and an explicit partnerId rather than `partnerDb` with a
 * seat: the caller is a cron with no session, and the staff tables' seat arm
 * would read as empty. The `where` clause is what makes that safe, and it names
 * the partner on every query.
 */
async function teamYesterday(
  partnerId: string,
  from: Date,
  to: Date,
): Promise<{ name: string; checkedIn: boolean; visits: number; flagged: number }[]> {
  try {
    const [seats, sessions, visits] = await systemDb(async (tx) => [
      await tx.partnerUser.findMany({
        where: { partnerId, status: "active" },
        select: { id: true, name: true, email: true },
      }),
      await tx.attendanceSession.findMany({
        where: { partnerId, checkInAt: { gte: from, lt: to } },
        select: { partnerUserId: true },
      }),
      await tx.staffVisit.findMany({
        where: { partnerId, occurredAt: { gte: from, lt: to } },
        select: { partnerUserId: true, distanceMeters: true, accuracy: true, lat: true },
      }),
    ]);

    const checkedIn = new Set(sessions.map((s) => s.partnerUserId));
    const counts = new Map<string, { visits: number; flagged: number }>();
    for (const v of visits) {
      const cur = counts.get(v.partnerUserId) ?? { visits: 0, flagged: 0 };
      cur.visits += 1;
      if (
        v.lat !== null &&
        v.distanceMeters !== null &&
        v.distanceMeters > VISIT_RADIUS_METERS + Math.max(0, v.accuracy ?? 0)
      ) {
        cur.flagged += 1;
      }
      counts.set(v.partnerUserId, cur);
    }

    return seats.map((s) => {
      const c = counts.get(s.id) ?? { visits: 0, flagged: 0 };
      return { name: s.name ?? s.email, checkedIn: checkedIn.has(s.id), ...c };
    });
  } catch {
    // The A7 tables are not migrated yet. An absent section is correct; an
    // empty one would say "nobody did anything", which is a different claim.
    return [];
  }
}

/**
 * Who on this partner's team gets the digest.
 *
 * A seat is IN unless it has turned every digest event off. No `notification_prefs`
 * row means in — the column defaults to true, and a partner who has never opened
 * the settings screen should be told when a payment fails rather than silently
 * excluded because a row was never written.
 *
 * Only the four events the digest actually covers count (`DIGEST_EVENTS`). A seat
 * that turned off "CANVEXIA posts an announcement" has said nothing about this
 * email.
 */
export async function digestRecipients(
  partnerId: string,
): Promise<{ email: string; name: string | null; role: string }[]> {
  return partnerDb(partnerId, async (tx) => {
    const seats = await tx.partnerUser.findMany({
      where: { status: "active" },
      select: { id: true, email: true, name: true, role: true },
    });
    if (seats.length === 0) return [];

    const prefs = await tx.notificationPref
      .findMany({
        where: {
          partnerUserId: { in: seats.map((s) => s.id) },
          event: { in: DIGEST_EVENTS as string[] },
        },
        select: { partnerUserId: true, email: true },
      })
      .catch(() => [] as { partnerUserId: string; email: boolean }[]);

    // Opted out only when there is at least one row AND every one of them is
    // off. Silence is consent; a partial set is not a refusal.
    const seen = new Map<string, boolean>();
    for (const p of prefs) {
      seen.set(p.partnerUserId, (seen.get(p.partnerUserId) ?? false) || p.email);
    }
    return seats
      .filter((s) => seen.get(s.id) !== false)
      .map((s) => ({ email: s.email, name: s.name, role: s.role }));
  });
}

export interface DigestResult {
  partnerId: string;
  /** False when `composeDigest` found nothing worth an email. Silence is a feature. */
  worthSending: boolean;
  queued: number;
  error?: string;
}

/**
 * One partner's digest, composed and queued.
 *
 * Idempotency is by DAY, not by row id: the job is scheduled once a day, but a
 * manual re-run or a Vercel retry must not queue a second copy. The guard is a
 * lookup for a `partner.digest` row created since Manila midnight, which is the
 * same window the digest itself covers.
 */
export async function runPartnerDigest(
  partner: { id: string; name: string },
  asOf: Date,
): Promise<DigestResult> {
  const recipients = await digestRecipients(partner.id);
  if (recipients.length === 0) {
    return { partnerId: partner.id, worthSending: false, queued: 0 };
  }

  // TWO DIGESTS, not one, when the team has both kinds of reader. A
  // salesperson's copy must not carry a list of who else did not check in —
  // that is their manager's business, and mailing it to everyone would be the
  // permission grid leaking through an email.
  const managerRoles = new Set(["admin", "ops_manager"]);
  const managers = recipients.filter((r) => managerRoles.has(r.role));
  const rest = recipients.filter((r) => !managerRoles.has(r.role));

  const [managerFacts, plainFacts] = await Promise.all([
    managers.length > 0
      ? buildDigestFacts(partner.id, partner.name, asOf, { includeTeam: true })
      : null,
    rest.length > 0 ? buildDigestFacts(partner.id, partner.name, asOf) : null,
  ]);

  const batches = [
    { digest: managerFacts ? composeDigest(managerFacts) : null, to: managers },
    { digest: plainFacts ? composeDigest(plainFacts) : null, to: rest },
  ].filter((b) => b.digest?.worthSending && b.to.length > 0) as {
    digest: { subject: string; body: string };
    to: { email: string; name: string | null }[];
  }[];

  if (batches.length === 0) {
    return { partnerId: partner.id, worthSending: false, queued: 0 };
  }

  const since = startOfManilaDay(asOf);
  return systemDb(async (tx) => {
    const already = await tx.outboundEmail.findFirst({
      where: { template: "partner.digest", partnerId: partner.id, createdAt: { gte: since } },
      select: { id: true },
    });
    if (already) return { partnerId: partner.id, worthSending: true, queued: 0 };

    const rows = batches.flatMap((b) =>
      b.to.map((r) => ({
        template: "partner.digest",
        toEmail: r.email,
        toName: r.name,
        partnerId: partner.id,
        // The composed text, not the facts: the copy a partner receives should
        // be what this run decided, not whatever the composer says weeks later
        // when the row is finally drained.
        payload: { subject: b.digest.subject, body: b.digest.body },
      })),
    );
    await tx.outboundEmail.createMany({ data: rows });
    return { partnerId: partner.id, worthSending: true, queued: rows.length };
  });
}
