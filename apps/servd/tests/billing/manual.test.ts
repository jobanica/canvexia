import { describe, it, expect } from "vitest";
import {
  addMonthKey,
  canSubmitActivation,
  coverageEnd,
  manilaMonthKey,
  manualBillingAction,
  nextBillingMonth,
  parsePesoAmount,
  parseReceiptForm,
} from "@/lib/billing/manual";
import { MAX_PAST_DUE_DAYS } from "@/lib/billing/lifecycle";

const utcDate = (s: string) => new Date(`${s}T00:00:00Z`);

describe("manual billing months", () => {
  it("adds months across a year", () => {
    expect(addMonthKey("2026-11", 3)).toBe("2027-02");
    expect(addMonthKey("2026-12", 1)).toBe("2027-01");
  });

  it("reads the month in Manila, not UTC", () => {
    // 31 Oct 17:00 UTC is 1 Nov 01:00 in Manila.
    expect(manilaMonthKey(new Date("2026-10-31T17:00:00Z"))).toBe("2026-11");
  });
});

describe("coverageEnd", () => {
  it("is the start of the month after the last month paid, Manila midnight", () => {
    const end = coverageEnd([{ billingMonthStart: utcDate("2026-11-01"), monthsCovered: 3 }]);
    expect(end?.toISOString()).toBe("2027-01-31T16:00:00.000Z"); // 1 Feb 2027 00:00 Manila
  });

  it("does not stack overlapping payments", () => {
    const end = coverageEnd([
      { billingMonthStart: utcDate("2026-11-01"), monthsCovered: 1 },
      { billingMonthStart: utcDate("2026-11-01"), monthsCovered: 1 },
    ]);
    expect(end?.toISOString()).toBe("2026-11-30T16:00:00.000Z");
  });

  it("is null with nothing paid", () => {
    expect(coverageEnd([])).toBeNull();
  });

  it("does not bridge a gap: the latest covered month decides", () => {
    const end = coverageEnd([
      { billingMonthStart: utcDate("2026-11-01"), monthsCovered: 1 },
      { billingMonthStart: utcDate("2027-03-01"), monthsCovered: 1 },
    ]);
    expect(end?.toISOString()).toBe("2027-03-31T16:00:00.000Z");
  });
});

describe("nextBillingMonth", () => {
  const now = new Date("2026-10-06T04:00:00Z");
  it("is this month when nothing is paid", () => {
    expect(nextBillingMonth(null, now)).toBe("2026-10");
  });
  it("is the first unpaid month", () => {
    expect(nextBillingMonth(new Date("2026-12-31T16:00:00Z"), now)).toBe("2027-01");
  });
  it("is this month when coverage has lapsed", () => {
    expect(nextBillingMonth(new Date("2026-06-30T16:00:00Z"), now)).toBe("2026-10");
  });
});

describe("manualBillingAction", () => {
  const now = new Date("2026-12-10T00:00:00Z");
  const DAY = 86_400_000;

  it("does nothing while the trial or paid coverage runs", () => {
    expect(manualBillingAction({ status: "trialing", trialEndsAt: new Date(now.getTime() + DAY), paidUntil: null }, now).action).toBe("none");
    expect(manualBillingAction({ status: "active", trialEndsAt: new Date("2026-01-01"), paidUntil: new Date(now.getTime() + DAY) }, now).action).toBe("none");
  });

  it("marks past due when coverage ends — never falls back to a free plan", () => {
    expect(manualBillingAction({ status: "active", trialEndsAt: null, paidUntil: new Date(now.getTime() - DAY) }, now).action).toBe("mark_past_due");
    expect(manualBillingAction({ status: "trialing", trialEndsAt: new Date(now.getTime() - DAY), paidUntil: null }, now).action).toBe("mark_past_due");
  });

  it("suspends after the same grace the gateway path gives", () => {
    const end = new Date(now.getTime() - MAX_PAST_DUE_DAYS * DAY);
    expect(manualBillingAction({ status: "past_due", trialEndsAt: null, paidUntil: end }, now).action).toBe("suspend");
    const almost = new Date(now.getTime() - (MAX_PAST_DUE_DAYS - 1) * DAY);
    expect(manualBillingAction({ status: "past_due", trialEndsAt: null, paidUntil: almost }, now).action).toBe("none");
  });

  it("counts paid coverage past the trial", () => {
    const r = manualBillingAction(
      { status: "trialing", trialEndsAt: new Date(now.getTime() - DAY), paidUntil: new Date(now.getTime() + DAY) },
      now,
    );
    expect(r.action).toBe("none");
  });
});

describe("receipt form", () => {
  const monthly = { type: "monthly", months_covered: "3", billing_month_start: "2026-11", amount: "2,400", bank_reference: " BPI-123 " };

  it("parses a monthly receipt", () => {
    expect(parseReceiptForm(monthly)).toEqual({
      ok: true,
      input: { type: "monthly", monthsCovered: 3, billingMonth: "2026-11", amount: 240000, bankReference: "BPI-123" },
    });
  });

  it("parses an activation receipt and ignores month fields", () => {
    const r = parseReceiptForm({ type: "activation", amount: "500", bank_reference: "GC-1" });
    expect(r.ok && r.input).toEqual({ type: "activation", monthsCovered: 1, billingMonth: null, amount: 50000, bankReference: "GC-1" });
  });

  it("requires the bank reference", () => {
    expect(parseReceiptForm({ ...monthly, bank_reference: "" }).ok).toBe(false);
  });

  it("refuses a zero or malformed amount and a bad month", () => {
    expect(parseReceiptForm({ ...monthly, amount: "0" }).ok).toBe(false);
    expect(parseReceiptForm({ ...monthly, amount: "8OO" }).ok).toBe(false);
    expect(parseReceiptForm({ ...monthly, billing_month_start: "2026-13" }).ok).toBe(false);
    expect(parseReceiptForm({ ...monthly, months_covered: "13" }).ok).toBe(false);
    expect(parsePesoAmount("12.345")).toBeNull();
  });

  it("allows one activation receipt at a time and none once confirmed", () => {
    expect(canSubmitActivation([])).toBe(true);
    expect(canSubmitActivation([{ type: "activation", status: "rejected" }])).toBe(true);
    expect(canSubmitActivation([{ type: "activation", status: "submitted" }])).toBe(false);
    expect(canSubmitActivation([{ type: "activation", status: "confirmed" }])).toBe(false);
  });
});
