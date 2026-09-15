import { ladderProgress, parseMilestones, type MilestoneProgress } from "@servd/core";

/**
 * The HQ health board, and what HQ should look at today.
 *
 * PURE. Takes facts, returns rows — no database, no clock of its own. The rules
 * here are judgements rather than measurements ("problems first" is an opinion
 * about what a problem is), so they live somewhere they can be tested at a
 * fixed date.
 *
 * MILESTONE STATUS IS NOT RECOMPUTED HERE. It calls `ladderProgress` from
 * packages/core — the same function the partner portal calls — because the
 * brief asks for "computed the same way as the partner portal" and the only way
 * to guarantee that is to call the same code. A second implementation is how
 * the two screens come to disagree about who is at risk, and the partner would
 * be reading one while HQ reads the other.
 */

export interface PartnerFact {
  id: string;
  name: string;
  email: string;
  status: string;
  tier: string;
  territory: string | null;
  isHouse: boolean;
  revenueSharePct: number;
  collectionMode: string;
  licenseStartedAt: Date | null;
  exclusivityExpiresAt: Date | null;
  /** The raw ladder from the partner row; null means the platform default. */
  milestones: unknown;
  /** Merchants owned, across every product. */
  merchants: number;
  /** Of those, how many are active and paying. */
  paying: number;
  /** Centavos per month, today's prices × today's active merchants. */
  mrrCentavos: number;
  /** The newest frozen statement, if there is one. */
  latestStatement: {
    month: string;
    payoutStatus: string;
    frozenAt: Date;
    partnerCentavos: number;
  } | null;
}

export interface HealthRow {
  id: string;
  name: string;
  territory: string | null;
  tier: string;
  isHouse: boolean;
  status: string;
  merchants: number;
  paying: number;
  mrrCentavos: number;
  /** CANVEXIA's cut of that MRR, floored. */
  hqShareCentavos: number;
  milestone: MilestoneProgress | null;
  /** Null when no expiry is set. Negative once it has passed. */
  daysToExclusivity: number | null;
  settlement: SettlementState;
  /** Lower sorts first. Problems first is the default the brief asks for. */
  trouble: number;
}

/**
 * Where a partner stands on money.
 *
 * "invoice" and "payout" are not cosmetic: `partner_collects` means the money
 * never passes through HQ, so what is owed flows the other way and HQ invoices
 * the partner for its share. Labelling both "payout" would tell half of all
 * partners they are owed money they actually owe.
 */
export type SettlementState =
  | { kind: "none" }
  | { kind: "pending"; direction: "payout" | "invoice"; month: string; centavos: number }
  | { kind: "paid"; direction: "payout" | "invoice"; month: string; centavos: number }
  | {
      kind: "overdue";
      direction: "payout" | "invoice";
      month: string;
      centavos: number;
      days: number;
    };

const DAY = 24 * 60 * 60 * 1000;

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY);
}

/**
 * Overdue is computed here, not read from the column.
 *
 * `partner_statements.payoutStatus` can say "overdue", but nothing sets it: the
 * brief asks for overdue to happen automatically after N days, and a status
 * that only becomes true when a cron remembers to run is a status that lies
 * every time the cron does not. So a stored "overdue" is honoured, and a
 * "pending" past the threshold is treated as overdue regardless.
 */
export function settlementOf(
  fact: Pick<PartnerFact, "latestStatement" | "collectionMode">,
  overdueDays: number,
  asOf: Date,
): SettlementState {
  const s = fact.latestStatement;
  if (!s) return { kind: "none" };
  const direction = fact.collectionMode === "hq_collects" ? "payout" : "invoice";
  const common = { direction, month: s.month, centavos: s.partnerCentavos } as const;

  if (s.payoutStatus === "paid") return { kind: "paid", ...common };

  const age = daysBetween(s.frozenAt, asOf);
  if (s.payoutStatus === "overdue" || age > overdueDays) {
    return { kind: "overdue", ...common, days: age };
  }
  return { kind: "pending", ...common };
}

/**
 * How much trouble a partner is in, as a sort key.
 *
 * Deliberately coarse. The point is to float the rows somebody has to act on to
 * the top, not to rank two healthy partners against each other — a board that
 * reorders itself every time an MRR figure moves by a peso is a board nobody
 * can find anything in. Within a band the caller's tie-break (MRR, descending)
 * keeps the order stable.
 */
export function troubleOf(row: Omit<HealthRow, "trouble">): number {
  if (row.status === "suspended") return 0;
  if (row.settlement.kind === "overdue") return 1;
  if (row.milestone?.status === "missed") return 2;
  if (row.daysToExclusivity !== null && row.daysToExclusivity <= 30) return 3;
  if (row.milestone?.status === "at_risk") return 4;
  if (row.status === "pending") return 5;
  // A partner with no merchants at all is not "fine", it is a licence sold and
  // nothing happening. It sits below the active problems and above the rest.
  if (row.status === "approved" && row.merchants === 0) return 6;
  return 7;
}

export function buildHealthBoard(
  partners: readonly PartnerFact[],
  opts: { overdueDays: number; asOf: Date },
): HealthRow[] {
  const rows = partners.map((p) => {
    const milestones = ladderProgress(
      parseMilestones(p.milestones),
      p.paying,
      p.licenseStartedAt,
      opts.asOf,
    );
    const base = {
      id: p.id,
      name: p.name,
      territory: p.territory,
      tier: p.tier,
      isHouse: p.isHouse,
      status: p.status,
      merchants: p.merchants,
      paying: p.paying,
      mrrCentavos: p.mrrCentavos,
      // Floor, not round. HQ's share is what is left after the partner's, and
      // rounding up here would show CANVEXIA a peso the partner also sees.
      hqShareCentavos: p.mrrCentavos - Math.floor((p.mrrCentavos * p.revenueSharePct) / 100),
      milestone: milestones.current,
      daysToExclusivity: p.exclusivityExpiresAt
        ? daysBetween(opts.asOf, p.exclusivityExpiresAt)
        : null,
      settlement: settlementOf(p, opts.overdueDays, opts.asOf),
    };
    return { ...base, trouble: troubleOf(base) };
  });

  // Problems first, then the biggest partner. Stable within a band.
  return rows.sort((a, b) => a.trouble - b.trouble || b.mrrCentavos - a.mrrCentavos);
}

// ----------------------------------------------------------------------------
// The attention list.
//
// THREE RULES, NOT FIVE. The brief asks for five:
//
//   1. partners overdue on invoices              ✅ partner_statements
//   2. milestone breaches                        ✅ the ladder above
//   3. domains stuck unverified > 7 days         ❌ no data
//   4. escalations open > 48h                    ❌ no data
//   5. waitlist cities with ≥5 and no partner    ✅ partner_waitlist
//
// (3) has nothing behind it: `listPartnerDomains` returns one *planned* entry
// and no partner domain has ever been registered, because no domain in this
// project resolves at all (docs/canvexia/domains.md). There is no row with a
// verification timestamp to be seven days old.
//
// (4) has nothing behind it either: there is no ticket or escalation system in
// this repository — no model, no table, nothing to read. The partner portal's
// own attention list dropped the same rule for the same reason.
//
// An always-empty section looks like everything is handled, which is worse than
// a section that is not there. Both come back the moment the data does.
// ----------------------------------------------------------------------------

export type HqAttentionKind = "overdue" | "milestone" | "demand";

export interface HqAttentionItem {
  kind: HqAttentionKind;
  href: string;
  title: string;
  detail: string;
  /** Lower sorts first. */
  priority: number;
}

export interface DemandFact {
  city: string;
  applicants: number;
  /** Whether a partner already holds this city. */
  taken: boolean;
}

/** A city with this many applicants and nobody serving it is money on the floor. */
export const DEMAND_THRESHOLD = 5;

export function buildHqAttention(
  board: readonly HealthRow[],
  demand: readonly DemandFact[],
): HqAttentionItem[] {
  const out: HqAttentionItem[] = [];

  for (const r of board) {
    if (r.settlement.kind === "overdue") {
      const s = r.settlement;
      out.push({
        kind: "overdue",
        href: `/hq/partners/${r.id}`,
        title: r.name,
        detail:
          s.direction === "payout"
            ? `Payout for ${s.month} is ${s.days} days old and unpaid`
            : `Invoice for ${s.month} is ${s.days} days old and unpaid`,
        priority: 0,
      });
    }
    if (r.milestone?.status === "missed") {
      out.push({
        kind: "milestone",
        href: `/hq/partners/${r.id}`,
        title: r.name,
        detail: `Missed month ${r.milestone.month}: ${r.milestone.actual} of ${r.milestone.target} merchants`,
        priority: 1,
      });
    }
  }

  for (const d of demand) {
    if (d.taken || d.applicants < DEMAND_THRESHOLD) continue;
    out.push({
      kind: "demand",
      href: `/hq/applications?city=${encodeURIComponent(d.city)}`,
      title: d.city,
      detail: `${d.applicants} applicants and no partner`,
      priority: 2,
    });
  }

  return out.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));
}
