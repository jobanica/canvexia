import type { PortalSettings } from "@/lib/settings";

/**
 * THE COMMISSION ENGINE. Pure: no database, no clock of its own.
 *
 * Products never calculate commission; this does, from data — the commission
 * rule the customer signed up under and the admin-editable settings. Nothing
 * here knows what ₱500 or ₱200 is.
 *
 * Rules (from the brief, settled with the owner):
 *   - Commission exists only once a payment is CONFIRMED.
 *   - Activation: one row of rule.activationCommission. Held (pending_release)
 *     until the customer's paid-month count reaches
 *     settings.activation_commission_release_month; 1 means immediately.
 *   - Monthly: one row per month covered. The customer's Nth PAID month earns
 *     tier1Amount while N <= tier1Months, then tier2Amount. Paid months, not
 *     calendar months: a skipped month earns nothing and does not advance N.
 *   - residual_max_months caps how many tier-2 months are paid;
 *     residual_requires_active_agent pays tier 2 only to an agent who referred
 *     someone within active_agent_window_days. A month that earns nothing
 *     writes no row, but still counts as paid.
 *   - No agent → no rows, but paid months still advance (an admin may attach
 *     a late code, and the count must be right when they do).
 *   - Payable from the 1st (Manila) of the month after confirmation: agents
 *     are paid monthly for what was confirmed in the previous month.
 */

export interface EngineRule {
  activationCommission: number;
  tier1Amount: number;
  tier1Months: number;
  tier2Amount: number;
}

export type EngineSettings = Pick<
  PortalSettings,
  "activation_commission_release_month" | "residual_max_months" | "residual_requires_active_agent"
>;

export interface NewCommission {
  kind: "activation" | "monthly";
  paidMonthNumber: number | null;
  amount: number;
  status: "pending_release" | "approved";
  payableFrom: Date;
}

/** The 1st of the Manila month after `at`, as a UTC instant. */
export function payableFromFor(at: Date): Date {
  const manila = new Date(at.getTime() + 8 * 3600_000);
  const y = manila.getUTCFullYear();
  const m = manila.getUTCMonth() + 1; // next month, 0-based + 1
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return new Date(`${ny}-${String(nm).padStart(2, "0")}-01T00:00:00+08:00`);
}

export function shouldReleaseActivation(settings: EngineSettings, paidMonths: number): boolean {
  return settings.activation_commission_release_month <= 1 || paidMonths >= settings.activation_commission_release_month;
}

/** What the Nth paid month earns. 0 means no row. */
export function monthlyAmount(rule: EngineRule, settings: EngineSettings, n: number, agentRecentlyActive: boolean): number {
  if (n <= rule.tier1Months) return rule.tier1Amount;
  const tier2Index = n - rule.tier1Months;
  if (settings.residual_max_months !== null && tier2Index > settings.residual_max_months) return 0;
  if (settings.residual_requires_active_agent && !agentRecentlyActive) return 0;
  return rule.tier2Amount;
}

export interface EngineInput {
  rule: EngineRule;
  settings: EngineSettings;
  paidMonthsBefore: number;
  payment: { type: "activation" | "monthly"; monthsCovered: number };
  hasAgent: boolean;
  agentRecentlyActive: boolean;
  confirmedAt: Date;
}

export interface EngineResult {
  rows: NewCommission[];
  paidMonthsAfter: number;
  /** Release this referral's held activation commission now. */
  releaseHeldActivation: boolean;
}

export function commissionsForPayment(input: EngineInput): EngineResult {
  const { rule, settings, payment, confirmedAt } = input;
  const payableFrom = payableFromFor(confirmedAt);
  const rows: NewCommission[] = [];

  if (payment.type === "activation") {
    if (input.hasAgent && rule.activationCommission > 0) {
      rows.push({
        kind: "activation",
        paidMonthNumber: null,
        amount: rule.activationCommission,
        status: shouldReleaseActivation(settings, input.paidMonthsBefore) ? "approved" : "pending_release",
        payableFrom,
      });
    }
    return { rows, paidMonthsAfter: input.paidMonthsBefore, releaseHeldActivation: false };
  }

  let n = input.paidMonthsBefore;
  for (let i = 0; i < payment.monthsCovered; i++) {
    n++;
    if (!input.hasAgent) continue;
    const amount = monthlyAmount(rule, settings, n, input.agentRecentlyActive);
    if (amount > 0) rows.push({ kind: "monthly", paidMonthNumber: n, amount, status: "approved", payableFrom });
  }
  return {
    rows,
    paidMonthsAfter: n,
    releaseHeldActivation: input.hasAgent && shouldReleaseActivation(settings, n),
  };
}

export interface ExistingCommission {
  id: string;
  amount: number;
  status: "pending_release" | "approved" | "paid" | "reversed";
  kind: "activation" | "monthly" | "reversal";
  /** Attached to a payout (draft, approved or paid): treated as already paid. */
  inPayout?: boolean;
}

export interface ReversalPlan {
  /** New rows: negative, each pointing at the row it cancels. */
  reversals: { reversesId: string; amount: number; status: "approved" | "reversed"; payableFrom: Date }[];
  /** Originals that were never paid, now marked reversed. */
  markReversed: string[];
}

/**
 * Reverse a payment's commissions. Never edits an amount, never deletes:
 *
 *   - An original NOT yet paid is marked `reversed`, and its negative twin is
 *     written `reversed` too — the pair nets to zero and neither is ever paid.
 *   - An original ALREADY paid — or already in a payout, which is a promise
 *     to pay it — stays as it is, and its negative twin is
 *     `approved` and payable next month, so it comes off the agent's next
 *     payout. If that leaves them negative, the balance carries forward.
 *   - Reversal rows and already-reversed rows are skipped, so reversing twice
 *     cannot double-charge.
 */
export function planReversal(originals: ExistingCommission[], now: Date): ReversalPlan {
  const payableFrom = payableFromFor(now);
  const plan: ReversalPlan = { reversals: [], markReversed: [] };
  for (const c of originals) {
    if (c.kind === "reversal" || c.status === "reversed" || c.amount <= 0) continue;
    if (c.status === "paid" || c.inPayout) {
      plan.reversals.push({ reversesId: c.id, amount: -c.amount, status: "approved", payableFrom });
    } else {
      plan.markReversed.push(c.id);
      plan.reversals.push({ reversesId: c.id, amount: -c.amount, status: "reversed", payableFrom });
    }
  }
  return plan;
}

/**
 * "month 4 of 6 at ₱200" — where a customer is on the ladder. `formatMoney` is
 * passed in so this stays free of display concerns.
 */
export function paidMonthLabel(
  rule: Pick<EngineRule, "tier1Months" | "tier1Amount" | "tier2Amount"> | null,
  paidMonths: number,
  formatMoney: (centavos: number) => string,
): string {
  if (paidMonths === 0) return "no paid months yet";
  if (!rule) return `month ${paidMonths}`;
  if (paidMonths <= rule.tier1Months) {
    return `month ${paidMonths} of ${rule.tier1Months} at ${formatMoney(rule.tier1Amount)}`;
  }
  return `month ${paidMonths} at ${formatMoney(rule.tier2Amount)}`;
}

/** Do two runs of months overlap? Months as "YYYY-MM" + count. */
export function monthsOverlap(aStart: string, aCount: number, bStart: string, bCount: number): boolean {
  const idx = (m: string) => {
    const [y, mo] = m.split("-").map(Number);
    return y * 12 + mo - 1;
  };
  const a0 = idx(aStart);
  const b0 = idx(bStart);
  return a0 < b0 + bCount && b0 < a0 + aCount;
}
