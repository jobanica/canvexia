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

/**
 * The provider-independent suspension arm.
 *
 * `failedCharges` only rises when a saved-card charge is attempted and fails. On
 * a gateway with no off-session charging — Xendit's `chargeSavedCard()` is a
 * deliberate no-op — none is ever attempted, so the count-based arm is
 * unreachable and a merchant could sit `past_due` forever while still using the
 * product. These assert the arm that fires regardless of provider.
 */
describe("nextBillingAction — unpaid invoice age", () => {
  const pastDue = {
    ...base,
    status: "past_due" as const,
    trialEndsAt: past,
    currentPeriodEnd: past,
  };

  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  it("suspends once an invoice has gone unpaid for the full window", () => {
    const d = nextBillingAction({ ...pastDue, oldestOpenInvoiceAt: daysAgo(14) }, now);
    expect(d.action).toBe("suspend");
    expect(d.reason).toMatch(/unpaid/);
  });

  it("suspends when it is well past the window", () => {
    expect(nextBillingAction({ ...pastDue, oldestOpenInvoiceAt: daysAgo(90) }, now).action).toBe(
      "suspend",
    );
  });

  it("does not suspend a day early", () => {
    expect(nextBillingAction({ ...pastDue, oldestOpenInvoiceAt: daysAgo(13) }, now).action).toBe(
      "await_payment",
    );
  });

  it("suspends even with failedCharges stuck at 0 — the whole point", () => {
    // This is exactly the Xendit shape: no card, no attempted charge, no
    // failures recorded. The old logic could only ever return await_payment.
    const d = nextBillingAction(
      { ...pastDue, failedCharges: 0, hasSavedCard: false, oldestOpenInvoiceAt: daysAgo(30) },
      now,
    );
    expect(d.action).toBe("suspend");
  });

  it("leaves a subscriber with nothing outstanding alone", () => {
    expect(nextBillingAction({ ...pastDue, oldestOpenInvoiceAt: null }, now).action).toBe(
      "await_payment",
    );
  });

  it("behaves exactly as before when the field is absent", () => {
    // Optional on the snapshot so existing callers keep working; absent must
    // never be read as "infinitely old".
    expect(nextBillingAction(pastDue, now).action).toBe("await_payment");
  });

  it("tolerates an invoice dated in the future rather than going negative", () => {
    const future1 = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    expect(nextBillingAction({ ...pastDue, oldestOpenInvoiceAt: future1 }, now).action).toBe(
      "await_payment",
    );
  });

  it("still suspends on max charge failures, whatever the invoice age", () => {
    const d = nextBillingAction(
      { ...pastDue, failedCharges: MAX_FAILED_CHARGES, oldestOpenInvoiceAt: daysAgo(1) },
      now,
    );
    expect(d.action).toBe("suspend");
    expect(d.reason).toMatch(/charge failures/);
  });

  it("does not suspend a healthy trialing subscriber with an old invoice", () => {
    // Age only escalates a subscription that is already past_due.
    expect(nextBillingAction({ ...base, oldestOpenInvoiceAt: daysAgo(90) }, now).action).toBe(
      "none",
    );
  });
});
