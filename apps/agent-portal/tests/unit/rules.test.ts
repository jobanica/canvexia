import { describe, it, expect } from "vitest";
import { pickRule, validateNewRule, type NewRuleInput, type RuleRow } from "@/lib/rules";
import { parseRuleForm } from "@/lib/rule-form";

const d = (s: string) => new Date(s);
const rules: RuleRow[] = [
  { id: "old", plan: null, validFrom: d("2026-01-01T00:00:00Z"), validTo: d("2026-07-01T00:00:00Z") },
  { id: "new", plan: null, validFrom: d("2026-07-01T00:00:00Z"), validTo: null },
  { id: "pro", plan: "pro", validFrom: d("2026-03-01T00:00:00Z"), validTo: null },
];

describe("pickRule", () => {
  it("picks the rule in force at signup", () => {
    expect(pickRule(rules, null, d("2026-02-01T00:00:00Z"))?.id).toBe("old");
    expect(pickRule(rules, null, d("2026-08-01T00:00:00Z"))?.id).toBe("new");
  });

  it("treats validTo as exclusive", () => {
    expect(pickRule(rules, null, d("2026-07-01T00:00:00Z"))?.id).toBe("new");
  });

  it("prefers a plan-specific rule, falling back to the product-wide one", () => {
    expect(pickRule(rules, "pro", d("2026-08-01T00:00:00Z"))?.id).toBe("pro");
    expect(pickRule(rules, "pro", d("2026-02-01T00:00:00Z"))?.id).toBe("old");
    expect(pickRule(rules, "basic", d("2026-08-01T00:00:00Z"))?.id).toBe("new");
  });

  it("returns null before any rule existed", () => {
    expect(pickRule(rules, null, d("2025-01-01T00:00:00Z"))).toBeNull();
  });
});

const input: NewRuleInput = {
  plan: null,
  activationFee: 50000,
  monthlyFee: 80000,
  activationCommission: 50000,
  tier1Amount: 20000,
  tier1Months: 6,
  tier2Amount: 10000,
  validFrom: d("2026-11-01T00:00:00Z"),
};

describe("validateNewRule", () => {
  const sameplan = rules.filter((r) => r.plan === null);

  it("closes the open rule at the new rule's start", () => {
    const r = validateNewRule(input, sameplan);
    expect(r.ok && r.closes?.id).toBe("new");
  });

  it("refuses to start a rule at or before the open rule — no rewriting history", () => {
    expect(validateNewRule({ ...input, validFrom: d("2026-07-01T00:00:00Z") }, sameplan).ok).toBe(false);
    expect(validateNewRule({ ...input, validFrom: d("2026-05-01T00:00:00Z") }, sameplan).ok).toBe(false);
  });

  it("refuses negative or fractional money", () => {
    expect(validateNewRule({ ...input, tier1Amount: -1 }, []).ok).toBe(false);
    expect(validateNewRule({ ...input, monthlyFee: 1.5 }, []).ok).toBe(false);
  });

  it("allows the first rule for a plan", () => {
    expect(validateNewRule(input, [])).toEqual({ ok: true, closes: null });
  });
});

describe("parseRuleForm", () => {
  it("turns the brief's table into centavos starting at Manila midnight", () => {
    const r = parseRuleForm({
      plan: "",
      activationFee: "500",
      monthlyFee: "800",
      activationCommission: "500",
      tier1Amount: "200",
      tier1Months: "6",
      tier2Amount: "100",
      validFrom: "2026-11-01",
    });
    expect(r).toEqual({ ok: true, input: { ...input, validFrom: d("2026-10-31T16:00:00Z") } });
  });

  it("refuses a missing amount", () => {
    expect(parseRuleForm({ activationFee: "", tier1Months: "6", validFrom: "2026-11-01" }).ok).toBe(false);
  });
});
