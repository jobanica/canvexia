import { describe, it, expect } from "vitest";
import {
  NO_FLOOR,
  validateFloorAgainstPrice,
  validatePriceAgainstFloor,
} from "@/lib/billing/price-floor";

/**
 * The floor is what stops one operator undercutting another into CANVEXIA's
 * revenue: the 30% is a share of what was actually charged, so a price war
 * between two partners is paid for by all three parties.
 */
describe("plan price floor", () => {
  describe("validatePriceAgainstFloor — a partner pricing against HQ's floor", () => {
    it("allows a price above the floor", () => {
      expect(validatePriceAgainstFloor({ priceMonthly: 99900, priceFloor: 49900 })).toEqual({
        ok: true,
      });
    });

    it("allows a price exactly at the floor", () => {
      expect(validatePriceAgainstFloor({ priceMonthly: 49900, priceFloor: 49900 })).toEqual({
        ok: true,
      });
    });

    it("rejects a price below the floor, and says both numbers", () => {
      const r = validatePriceAgainstFloor({ priceMonthly: 29900, priceFloor: 49900 });
      expect(r.ok).toBe(false);
      // The person reading this is deciding whether the price or the floor is
      // wrong, so the message has to carry both.
      if (!r.ok) {
        expect(r.error).toContain("₱299.00");
        expect(r.error).toContain("₱499.00");
      }
    });

    it("treats a zero floor as no floor", () => {
      expect(validatePriceAgainstFloor({ priceMonthly: 100, priceFloor: NO_FLOOR }).ok).toBe(true);
      expect(NO_FLOOR).toBe(0);
    });

    it("allows a free plan under any floor — giving something away is not undercutting", () => {
      expect(validatePriceAgainstFloor({ priceMonthly: 0, priceFloor: 99900 }).ok).toBe(true);
    });

    it("rejects non-integer or negative money rather than rounding it", () => {
      expect(validatePriceAgainstFloor({ priceMonthly: 999.5, priceFloor: 0 }).ok).toBe(false);
      expect(validatePriceAgainstFloor({ priceMonthly: -100, priceFloor: 0 }).ok).toBe(false);
      expect(validatePriceAgainstFloor({ priceMonthly: 100, priceFloor: -1 }).ok).toBe(false);
    });
  });

  describe("validateFloorAgainstPrice — HQ setting the floor", () => {
    it("allows a floor at or below the plan's own price", () => {
      expect(validateFloorAgainstPrice({ priceFloor: 49900, priceMonthly: 99900 }).ok).toBe(true);
      expect(validateFloorAgainstPrice({ priceFloor: 99900, priceMonthly: 99900 }).ok).toBe(true);
    });

    it("rejects a floor above the plan's own price", () => {
      // Otherwise the platform's default price is illegal under the platform's
      // own rule, and nobody finds out until the next unrelated plan edit fails.
      const r = validateFloorAgainstPrice({ priceFloor: 149900, priceMonthly: 99900 });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/above this plan's own price/);
    });

    it("allows any floor on a free plan", () => {
      expect(validateFloorAgainstPrice({ priceFloor: 99900, priceMonthly: 0 }).ok).toBe(true);
    });

    it("allows clearing the floor", () => {
      expect(validateFloorAgainstPrice({ priceFloor: 0, priceMonthly: 99900 }).ok).toBe(true);
    });
  });

});
