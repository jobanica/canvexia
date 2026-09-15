/**
 * The Overview's attention list: what a partner should do today.
 *
 * PURE. Takes facts, returns rows — no database, no clock of its own. The rules
 * are the part worth arguing about ("no orders in 14 days" is a judgement, not a
 * measurement), so they live somewhere they can be tested at a fixed date.
 *
 * FOUR RULES, NOT FIVE. The brief asks for "open tickets awaiting partner
 * reply" as well. There is no ticket system in this repository — no model, no
 * table, nothing to read. Rather than render an always-empty section that looks
 * like everything is handled, the rule is absent and this comment is why.
 */
export type AttentionKind = "past_due" | "trial_ending" | "quiet" | "follow_up";

export interface AttentionItem {
  kind: AttentionKind;
  /** Where the row links. Merchant rows link to the merchant, prospects to the pipeline. */
  href: string;
  title: string;
  detail: string;
  /** Lower sorts first. */
  priority: number;
}

export interface MerchantFact {
  id: string;
  productId: string;
  name: string;
  /** null for a product that does not bill yet — see `QUIET_DAYS` note. */
  subscriptionStatus: "trialing" | "active" | "past_due" | "cancelled" | null;
  trialEndsAt: Date | null;
  /** Null when the merchant has never had an order, which is NOT the same as quiet. */
  lastOrderAt: Date | null;
  createdAt: Date;
}

export interface ProspectFact {
  id: string;
  businessName: string;
  nextFollowUpAt: Date | null;
}

/** A trial inside this many days is worth a nudge. */
export const TRIAL_WARNING_DAYS = 7;
/** Silence this long from a live merchant is worth a visit. */
export const QUIET_DAYS = 14;

const DAY = 24 * 60 * 60 * 1000;

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY);
}

export function buildAttention(
  merchants: readonly MerchantFact[],
  prospects: readonly ProspectFact[],
  asOf: Date,
): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const m of merchants) {
    const href = `/partner/merchants/${m.productId}:${m.id}`;

    if (m.subscriptionStatus === "past_due") {
      items.push({
        kind: "past_due",
        href,
        title: m.name,
        detail: "Payment failed — the account is past due.",
        priority: 0,
      });
    }

    if (m.subscriptionStatus === "trialing" && m.trialEndsAt) {
      const left = daysBetween(asOf, m.trialEndsAt);
      if (left <= TRIAL_WARNING_DAYS) {
        items.push({
          kind: "trial_ending",
          href,
          title: m.name,
          detail:
            left < 0
              ? "Trial has ended and no plan was chosen."
              : left === 0
                ? "Trial ends today."
                : `Trial ends in ${left} day${left === 1 ? "" : "s"}.`,
          priority: 1,
        });
      }
    }

    // Quiet, but only for a merchant that HAS traded. A merchant with no orders
    // ever is not quiet — they are new, or they were never onboarded, and
    // telling a partner "no orders in 14 days" about a shop opened yesterday is
    // noise that trains them to ignore the list.
    //
    // Cancelled accounts are excluded for the same reason: they are supposed to
    // be quiet.
    if (m.lastOrderAt && m.subscriptionStatus !== "cancelled") {
      const quietFor = daysBetween(m.lastOrderAt, asOf);
      if (quietFor >= QUIET_DAYS) {
        items.push({
          kind: "quiet",
          href,
          title: m.name,
          detail: `No orders in ${quietFor} days.`,
          priority: 2,
        });
      }
    }
  }

  for (const p of prospects) {
    if (!p.nextFollowUpAt) continue;
    // Due TODAY or overdue. A follow-up set for next week is a plan, not an
    // action, and belongs on the pipeline rather than here.
    if (daysBetween(p.nextFollowUpAt, asOf) >= 0) {
      const late = daysBetween(p.nextFollowUpAt, asOf);
      items.push({
        kind: "follow_up",
        href: `/partner/pipeline?prospect=${p.id}`,
        title: p.businessName,
        detail: late === 0 ? "Follow up today." : `Follow-up ${late} day${late === 1 ? "" : "s"} overdue.`,
        priority: late === 0 ? 3 : 1,
      });
    }
  }

  return items.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));
}
