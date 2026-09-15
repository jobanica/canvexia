/**
 * What one staff member earned on the merchants they signed.
 *
 * PURE. The interesting decisions here are which settlements count, which rule
 * applies to which one, and what happens when two rules overlap — and none of
 * them need a database to be argued about or tested. Reading the ledger and
 * writing the statement are the caller's job, exactly as with `composeStatement`.
 *
 * NOT PAYROLL. No tax, no deductions, no bank details, no transfers. This
 * computes what a partner owes their own salesperson so both of them can see
 * the same number; paying it happens outside this system, which is what the
 * brief asks for and also what keeps this out of BIR territory.
 */

/** A settlement that has already been attributed to a staff member. */
export interface CommissionFact {
  /** The ledger row this came from. Unique per statement, so a replay is safe. */
  ledgerEntryId: string;
  productId: string;
  merchantId: string;
  merchantName: string | null;
  /** Centavos that actually settled. */
  grossAmount: number;
  /** True when this is the merchant's FIRST settlement, for pct_first_month. */
  isFirstPayment: boolean;
  occurredAt: Date;
}

export type CommissionRuleType = "per_signup" | "pct_first_month" | "pct_recurring" | "none";

export interface CommissionRuleFact {
  type: CommissionRuleType;
  /** Centavos for per_signup; BASIS POINTS for the two percentages. */
  value: number;
  appliesTo: "all_products" | "product";
  productId: string | null;
  startsAt: Date;
  endsAt: Date | null;
}

export interface CommissionLineFact {
  ledgerEntryId: string;
  productId: string;
  merchantId: string;
  merchantName: string | null;
  ruleType: CommissionRuleType;
  ruleValue: number;
  /** What the percentage was taken of. Equals the amount for per_signup. */
  basisCentavos: number;
  amountCentavos: number;
}

export interface CommissionStatementDraft {
  month: string;
  totalCentavos: number;
  lines: CommissionLineFact[];
}

/** Does a rule cover this settlement, at the moment it happened? */
export function ruleApplies(rule: CommissionRuleFact, fact: CommissionFact): boolean {
  if (rule.type === "none") return false;
  if (fact.occurredAt < rule.startsAt) return false;
  // `endsAt` is EXCLUSIVE. A rule that ended on the 1st did not cover the 1st,
  // which is the reading that makes "ends when the next one starts" produce no
  // overlap and no gap.
  if (rule.endsAt && fact.occurredAt >= rule.endsAt) return false;
  if (rule.appliesTo === "product" && rule.productId !== fact.productId) return false;
  if (rule.type === "pct_first_month" && !fact.isFirstPayment) return false;
  return true;
}

/**
 * Compute one month's commission.
 *
 * SEVERAL RULES MAY PAY ON THE SAME SETTLEMENT and that is the arrangement, not
 * a bug: per_signup plus pct_recurring is the ordinary way a partner pays a
 * salesperson. Each matching rule produces its OWN line, so the statement
 * explains itself — a single summed figure is the thing nobody can check.
 *
 * `per_signup` only pays on the FIRST settlement. Paying it monthly would turn
 * a one-off signing bonus into a second recurring percentage, silently, and
 * nobody would notice until the third month.
 *
 * Every line snapshots the rule that produced it. A rule edited in March must
 * not rewrite January — the same reasoning as `PartnerLedgerEntry.sharePct`.
 */
export function computeCommission(
  month: string,
  rules: readonly CommissionRuleFact[],
  facts: readonly CommissionFact[],
): CommissionStatementDraft {
  const lines: CommissionLineFact[] = [];

  for (const fact of facts) {
    for (const rule of rules) {
      if (!ruleApplies(rule, fact)) continue;

      let amount = 0;
      let basis = 0;
      if (rule.type === "per_signup") {
        // A flat fee, and only on the first payment. `value` is centavos.
        if (!fact.isFirstPayment) continue;
        amount = rule.value;
        basis = rule.value;
      } else {
        // Basis points on what settled. Rounded DOWN, so the sum of the lines
        // can never exceed what the partner was actually paid — the same floor
        // the partner's own share uses.
        basis = fact.grossAmount;
        amount = Math.floor((fact.grossAmount * rule.value) / 10_000);
      }
      if (amount <= 0) continue;

      lines.push({
        ledgerEntryId: fact.ledgerEntryId,
        productId: fact.productId,
        merchantId: fact.merchantId,
        merchantName: fact.merchantName,
        ruleType: rule.type,
        ruleValue: rule.value,
        basisCentavos: basis,
        amountCentavos: amount,
      });
    }
  }

  // Newest first inside a merchant, merchants in name order: a statement is
  // read down, and grouping by merchant is how somebody checks it against what
  // they remember signing.
  lines.sort(
    (a, b) =>
      (a.merchantName ?? a.merchantId).localeCompare(b.merchantName ?? b.merchantId) ||
      a.ruleType.localeCompare(b.ruleType),
  );

  return {
    month,
    totalCentavos: lines.reduce((n, l) => n + l.amountCentavos, 0),
    lines,
  };
}

/** Human copy for a rule, used on the statement and in the rules editor. */
export function describeRule(rule: {
  type: CommissionRuleType;
  value: number;
  appliesTo?: string;
}): string {
  const scope = rule.appliesTo === "product" ? " (one product)" : "";
  switch (rule.type) {
    case "per_signup":
      return `₱${Math.round(rule.value / 100).toLocaleString("en-PH")} per signing${scope}`;
    case "pct_first_month":
      return `${(rule.value / 100).toFixed(2)}% of the first payment${scope}`;
    case "pct_recurring":
      return `${(rule.value / 100).toFixed(2)}% of every payment${scope}`;
    case "none":
      return "No commission";
  }
}
