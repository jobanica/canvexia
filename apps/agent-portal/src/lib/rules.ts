/**
 * Commission rules: which one applies, and whether a new one may be added.
 *
 * A rule is data — prices and commission per product, optionally per plan,
 * valid for a period. A referral is pinned to the rule in force when the
 * customer signed up, so a price change affects new customers only.
 */

export interface RuleRow {
  id: string;
  plan: string | null;
  validFrom: Date;
  validTo: Date | null;
}

function covers(rule: RuleRow, at: Date): boolean {
  return rule.validFrom <= at && (rule.validTo === null || at < rule.validTo);
}

/**
 * The rule for a customer on `plan`, signing up at `at`. A plan-specific rule
 * wins over the product-wide one (plan = null); among several, the latest
 * validFrom wins.
 */
export function pickRule<R extends RuleRow>(rules: R[], plan: string | null, at: Date): R | null {
  const live = rules.filter((r) => covers(r, at));
  const latest = (rs: R[]) =>
    rs.reduce<R | null>((best, r) => (!best || r.validFrom > best.validFrom ? r : best), null);
  if (plan) {
    const specific = latest(live.filter((r) => r.plan === plan));
    if (specific) return specific;
  }
  return latest(live.filter((r) => r.plan === null));
}

export interface NewRuleInput {
  plan: string | null;
  activationFee: number;
  monthlyFee: number;
  activationCommission: number;
  tier1Amount: number;
  tier1Months: number;
  tier2Amount: number;
  validFrom: Date;
}

/**
 * Check a new rule against the existing ones for the same product and plan.
 *
 * A new rule never rewrites an old one. It starts at `validFrom` and the rule
 * open until then is closed at that instant — returned as `closes` for the
 * caller to update in the same transaction. A new rule may not start at or
 * before the open rule's own start: that would retroactively replace terms
 * customers already signed up under.
 */
export function validateNewRule(
  input: NewRuleInput,
  existingSamePlan: RuleRow[],
): { ok: true; closes: RuleRow | null } | { ok: false; error: string } {
  const money = [
    input.activationFee,
    input.monthlyFee,
    input.activationCommission,
    input.tier1Amount,
    input.tier2Amount,
  ];
  if (money.some((m) => !Number.isInteger(m) || m < 0)) {
    return { ok: false, error: "Amounts must be zero or more, in whole centavos." };
  }
  if (!Number.isInteger(input.tier1Months) || input.tier1Months < 0) {
    return { ok: false, error: "Tier 1 months must be a whole number." };
  }
  if (Number.isNaN(input.validFrom.getTime())) {
    return { ok: false, error: "Valid-from date is required." };
  }
  for (const r of existingSamePlan) {
    if (r.validTo === null && input.validFrom <= r.validFrom) {
      return {
        ok: false,
        error: "A new rule must start after the current one does. Rules are never rewritten backwards.",
      };
    }
    if (r.validTo !== null && input.validFrom < r.validTo) {
      return { ok: false, error: "That date falls inside an earlier rule's period." };
    }
  }
  const open = existingSamePlan.find((r) => r.validTo === null) ?? null;
  return { ok: true, closes: open };
}
