import { parsePesos } from "@/lib/money";
import { manilaMidnight } from "@/lib/time";
import type { NewRuleInput } from "@/lib/rules";

/** The add-rule form (pesos, a Manila date) → a rule (centavos, a UTC instant). */
export function parseRuleForm(
  f: Record<string, string | undefined>,
): { ok: true; input: NewRuleInput } | { ok: false; error: string } {
  const money: Record<string, number | null> = {
    activationFee: parsePesos(f.activationFee),
    monthlyFee: parsePesos(f.monthlyFee),
    activationCommission: parsePesos(f.activationCommission),
    tier1Amount: parsePesos(f.tier1Amount),
    tier2Amount: parsePesos(f.tier2Amount),
  };
  for (const [k, v] of Object.entries(money)) {
    if (v === null) return { ok: false, error: `${k}: enter an amount in pesos, e.g. 500 or 199.50.` };
  }
  const tier1Months = Number(f.tier1Months);
  if (!Number.isInteger(tier1Months) || tier1Months < 0 || tier1Months > 120) {
    return { ok: false, error: "Tier 1 months must be a whole number." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.validFrom ?? "")) {
    return { ok: false, error: "Choose the date the rule starts." };
  }
  const plan = (f.plan ?? "").trim();
  return {
    ok: true,
    input: {
      plan: plan === "" ? null : plan,
      activationFee: money.activationFee!,
      monthlyFee: money.monthlyFee!,
      activationCommission: money.activationCommission!,
      tier1Amount: money.tier1Amount!,
      tier1Months,
      tier2Amount: money.tier2Amount!,
      validFrom: manilaMidnight(f.validFrom!),
    },
  };
}
