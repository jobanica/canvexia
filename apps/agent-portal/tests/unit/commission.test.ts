import { describe, it, expect } from "vitest";
import {
  commissionsForPayment,
  monthsOverlap,
  paidMonthLabel,
  payableFromFor,
  planReversal,
  type EngineInput,
} from "@/lib/commission";
import { nextPayoutDate, planPayouts, statementCsv } from "@/lib/payouts";
import { peso } from "@/lib/money";
import { SETTING_DEFAULTS } from "@/lib/settings";

// The brief's table, as data: ₱500 activation, ₱200 × 6 paid months, then ₱100.
const rule = { activationCommission: 50000, tier1Amount: 20000, tier1Months: 6, tier2Amount: 10000 };
const at = new Date("2026-10-15T04:00:00Z");
const base: EngineInput = {
  rule,
  settings: SETTING_DEFAULTS,
  paidMonthsBefore: 0,
  payment: { type: "monthly", monthsCovered: 1 },
  hasAgent: true,
  agentRecentlyActive: true,
  confirmedAt: at,
};
const run = (over: Partial<EngineInput>) => commissionsForPayment({ ...base, ...over });

describe("commission engine — the brief's cases", () => {
  it("activation confirmed: one ₱500 row, payable immediately by default", () => {
    const r = run({ payment: { type: "activation", monthsCovered: 1 } });
    expect(r.rows).toEqual([
      { kind: "activation", paidMonthNumber: null, amount: 50000, status: "approved", payableFrom: payableFromFor(at) },
    ]);
    expect(r.paidMonthsAfter).toBe(0); // an activation is not a paid month
  });

  it("paid months 1 to 6 write ₱200, month 7 writes ₱100", () => {
    const amounts: number[] = [];
    let paid = 0;
    for (let i = 0; i < 7; i++) {
      const r = run({ paidMonthsBefore: paid });
      amounts.push(...r.rows.map((x) => x.amount));
      paid = r.paidMonthsAfter;
    }
    expect(amounts).toEqual([20000, 20000, 20000, 20000, 20000, 20000, 10000]);
    expect(paid).toBe(7);
  });

  it("a skipped month does not advance the count", () => {
    // January paid, February skipped, March paid: March is paid month 2.
    const jan = run({ paidMonthsBefore: 0 });
    const mar = run({ paidMonthsBefore: jan.paidMonthsAfter });
    expect(mar.rows[0].paidMonthNumber).toBe(2);
    expect(mar.rows[0].amount).toBe(20000);
  });

  it("one payment covering three months writes three rows, crossing 6 → 7 correctly", () => {
    const r = run({ paidMonthsBefore: 5, payment: { type: "monthly", monthsCovered: 3 } });
    expect(r.rows.map((x) => [x.paidMonthNumber, x.amount])).toEqual([
      [6, 20000],
      [7, 10000],
      [8, 10000],
    ]);
    expect(r.paidMonthsAfter).toBe(8);
  });

  it("activation_commission_release_month = 3 holds the ₱500 until the third paid month", () => {
    const settings = { ...SETTING_DEFAULTS, activation_commission_release_month: 3 };
    const act = run({ settings, payment: { type: "activation", monthsCovered: 1 } });
    expect(act.rows[0].status).toBe("pending_release");
    expect(run({ settings, paidMonthsBefore: 0 }).releaseHeldActivation).toBe(false); // month 1
    expect(run({ settings, paidMonthsBefore: 1 }).releaseHeldActivation).toBe(false); // month 2
    expect(run({ settings, paidMonthsBefore: 2 }).releaseHeldActivation).toBe(true); // month 3
  });

  it("releases at once if the activation is confirmed after the release month", () => {
    const settings = { ...SETTING_DEFAULTS, activation_commission_release_month: 3 };
    expect(run({ settings, paidMonthsBefore: 4, payment: { type: "activation", monthsCovered: 1 } }).rows[0].status).toBe("approved");
  });
});

describe("commission engine — settings and edges", () => {
  it("caps tier 2 at residual_max_months", () => {
    const settings = { ...SETTING_DEFAULTS, residual_max_months: 2 };
    const r = run({ settings, paidMonthsBefore: 6, payment: { type: "monthly", monthsCovered: 4 } });
    expect(r.rows.map((x) => x.paidMonthNumber)).toEqual([7, 8]);
    expect(r.paidMonthsAfter).toBe(10); // the unpaid months still count
  });

  it("pays tier 2 only to a recently active agent when required — tier 1 regardless", () => {
    const settings = { ...SETTING_DEFAULTS, residual_requires_active_agent: true };
    expect(run({ settings, paidMonthsBefore: 6, agentRecentlyActive: false }).rows).toEqual([]);
    expect(run({ settings, paidMonthsBefore: 2, agentRecentlyActive: false }).rows).toHaveLength(1);
  });

  it("writes nothing for a customer with no agent but still advances the count", () => {
    const r = run({ hasAgent: false, payment: { type: "monthly", monthsCovered: 2 } });
    expect(r.rows).toEqual([]);
    expect(r.paidMonthsAfter).toBe(2);
    expect(r.releaseHeldActivation).toBe(false);
  });

  it("is payable from the 1st of the next Manila month", () => {
    expect(payableFromFor(new Date("2026-10-31T17:00:00Z")).toISOString()).toBe("2026-11-30T16:00:00.000Z"); // already Nov in Manila
    expect(payableFromFor(new Date("2026-12-10T00:00:00Z")).toISOString()).toBe("2026-12-31T16:00:00.000Z");
  });
});

describe("reversal plan", () => {
  it("writes a matching negative row for each commission; unpaid pairs net out unpaid", () => {
    const plan = planReversal(
      [
        { id: "a", amount: 20000, status: "approved", kind: "monthly" },
        { id: "b", amount: 50000, status: "pending_release", kind: "activation" },
      ],
      at,
    );
    expect(plan.markReversed).toEqual(["a", "b"]);
    expect(plan.reversals.map((r) => [r.reversesId, r.amount, r.status])).toEqual([
      ["a", -20000, "reversed"],
      ["b", -50000, "reversed"],
    ]);
  });

  it("an original already paid out stays paid and its reversal comes off the next payout", () => {
    const plan = planReversal([{ id: "p", amount: 20000, status: "paid", kind: "monthly" }], at);
    expect(plan.markReversed).toEqual([]);
    expect(plan.reversals).toEqual([{ reversesId: "p", amount: -20000, status: "approved", payableFrom: payableFromFor(at) }]);
  });

  it("treats a row already in a payout as paid, and never reverses a reversal", () => {
    const plan = planReversal(
      [
        { id: "x", amount: 20000, status: "approved", kind: "monthly", inPayout: true },
        { id: "r", amount: -20000, status: "approved", kind: "reversal" },
        { id: "z", amount: 20000, status: "reversed", kind: "monthly" },
      ],
      at,
    );
    expect(plan.reversals.map((r) => [r.reversesId, r.status])).toEqual([["x", "approved"]]);
  });
});

describe("payouts", () => {
  it("pays agents at or above the minimum and carries the rest, negatives included", () => {
    const r = planPayouts(
      [
        { id: "1", agentId: "A", amount: 50000 },
        { id: "2", agentId: "A", amount: 20000 },
        { id: "3", agentId: "B", amount: 20000 },
        { id: "4", agentId: "C", amount: 20000 },
        { id: "5", agentId: "C", amount: -50000 },
      ],
      50000,
    );
    expect(r.payouts).toEqual([{ agentId: "A", total: 70000, commissionIds: ["1", "2"] }]);
    expect(r.carried).toEqual([
      { agentId: "B", total: 20000 },
      { agentId: "C", total: -30000 },
    ]);
  });

  it("knows the next payout date", () => {
    expect(nextPayoutDate(15, new Date("2026-10-06T00:00:00Z")).toISOString()).toBe("2026-10-14T16:00:00.000Z");
    expect(nextPayoutDate(15, new Date("2026-10-20T00:00:00Z")).toISOString()).toBe("2026-11-14T16:00:00.000Z");
    expect(nextPayoutDate(15, new Date("2026-12-20T00:00:00Z")).toISOString()).toBe("2027-01-14T16:00:00.000Z");
  });

  it("writes a statement CSV with escaping", () => {
    const csv = statementCsv(
      { period: "2026-11", total: 70000, referenceNumber: "GC-9", method: "GCash · Ana · 0917" },
      [{ createdAt: "2026-10-15", customer: 'Ana "Big" Grill, Inc', product: "Servd", kind: "monthly", paidMonthNumber: 1, amount: 20000 }],
    );
    expect(csv).toContain('"Ana ""Big"" Grill, Inc"');
    expect(csv).toContain("Total (PHP),700.00");
  });
});

describe("display helpers", () => {
  it("labels the ladder the way the brief does", () => {
    expect(paidMonthLabel(rule, 4, peso)).toBe("month 4 of 6 at ₱200.00");
    expect(paidMonthLabel(rule, 9, peso)).toBe("month 9 at ₱100.00");
    expect(paidMonthLabel(rule, 0, peso)).toBe("no paid months yet");
  });

  it("detects overlapping months", () => {
    expect(monthsOverlap("2026-11", 3, "2027-01", 1)).toBe(true);
    expect(monthsOverlap("2026-11", 2, "2027-01", 1)).toBe(false);
    expect(monthsOverlap("2026-12", 1, "2026-11", 2)).toBe(true);
  });
});
