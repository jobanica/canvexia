import { describe, it, expect } from "vitest";
import { pickPharmacy, type Membership } from "@/lib/pharmacy/active-pharmacy";

/**
 * The cookie is a request, not a fact. These are the tests that say so.
 */
const alpha: Membership = { pharmacyId: "alpha", createdAt: "2026-01-01", active: true };
const beta: Membership = { pharmacyId: "beta", createdAt: "2026-06-01", active: true };
const pending: Membership = { pharmacyId: "pending", createdAt: "2025-01-01", active: false };

describe("picking the active pharmacy", () => {
  it("returns null when this login is staff nowhere", () => {
    expect(pickPharmacy([], "alpha")).toBeNull();
    expect(pickPharmacy([], null)).toBeNull();
  });

  it("honours a cookie naming a pharmacy they are staff at", () => {
    expect(pickPharmacy([alpha, beta], "beta")).toBe("beta");
  });

  it("IGNORES a cookie naming one they are not", () => {
    // The whole reason this is a function. A cookie is browser-controlled, so
    // honouring it unchecked would be a one-line tenancy bypass.
    expect(pickPharmacy([alpha, beta], "someone-elses")).toBe("alpha");
  });

  it("does not lock anyone out when their membership was removed", () => {
    // A stale cookie from a membership that is gone should land them in their
    // remaining pharmacy, not in an error.
    expect(pickPharmacy([beta], "alpha")).toBe("beta");
  });

  it("defaults to the oldest membership — the one they actually work at", () => {
    expect(pickPharmacy([beta, alpha], null)).toBe("alpha");
  });

  it("prefers an active pharmacy over an older pending one", () => {
    // `pending` is the oldest, but a pharmacy that cannot dispense is not where
    // to strand someone who also has a live one.
    expect(pickPharmacy([pending, beta], null)).toBe("beta");
  });

  it("falls back to a pending one when that is all there is", () => {
    expect(pickPharmacy([pending], null)).toBe("pending");
  });

  it("still honours an explicit request for a pending pharmacy", () => {
    // Setting it up is a real reason to go there.
    expect(pickPharmacy([pending, beta], "pending")).toBe("pending");
  });

  it("does not mutate the list it was given", () => {
    const list = [beta, alpha];
    const copy = [...list];
    pickPharmacy(list, null);
    expect(list).toEqual(copy);
  });
});
