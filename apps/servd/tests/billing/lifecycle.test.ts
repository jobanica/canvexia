import { describe, it, expect } from "vitest";
import { nextBillingAction, MAX_FAILED_CHARGES } from "@/lib/billing/lifecycle";
import { addMonths } from "@/lib/billing/period";

const now = new Date("2026-06-14T00:00:00Z");
const past = new Date("2026-06-13T00:00:00Z");
const future = new Date("2026-07-14T00:00:00Z");

const base = {
  status: "trialing" as const,
  trialEndsAt: future,
  currentPeriodEnd: future,
  failedCharges: 0,
  cancelAtPeriodEnd: false,
  hasSavedCard: false,
};

describe("nextBillingAction", () => {
  it("does nothing during an active trial", () => {
    expect(nextBillingAction(base, now).action).toBe("none");
  });

  it("at trial end with no card → await_payment", () => {
    expect(nextBillingAction({ ...base, trialEndsAt: past }, now).action).toBe("await_payment");
  });

  it("at trial end with a saved card → charge", () => {
    expect(
      nextBillingAction({ ...base, trialEndsAt: past, hasSavedCard: true }, now).action,
    ).toBe("charge");
  });

  it("active period due with card → charge", () => {
    expect(
      nextBillingAction(
        { ...base, status: "active", currentPeriodEnd: past, hasSavedCard: true },
        now,
      ).action,
    ).toBe("charge");
  });

  it("past_due retries while under the failure cap", () => {
    expect(
      nextBillingAction(
        { ...base, status: "past_due", failedCharges: 1, hasSavedCard: true },
        now,
      ).action,
    ).toBe("charge");
  });

  it("past_due suspends at the failure cap", () => {
    expect(
      nextBillingAction(
        { ...base, status: "past_due", failedCharges: MAX_FAILED_CHARGES, hasSavedCard: true },
        now,
      ).action,
    ).toBe("suspend");
  });

  it("due + scheduled cancellation → cancel", () => {
    expect(
      nextBillingAction({ ...base, trialEndsAt: past, cancelAtPeriodEnd: true }, now).action,
    ).toBe("cancel");
  });
});

describe("addMonths", () => {
  it("rolls the year over", () => {
    const d = addMonths(new Date("2026-11-15T00:00:00Z"), 2);
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(0); // January
  });
});
