import { describe, it, expect } from "vitest";
import {
  DEFAULT_OPERATOR_SHARE_PCT,
  isLegacyTier,
  isOperatorTier,
  splitRevenue,
  validateRevenueShare,
} from "@/lib/partners/revenue-share";

/**
 * The grandfather line, asserted.
 *
 * The decision these tests protect is in docs/canvexia/decisions.md (D2): the
 * 70/30 split applies to NEW partners only, and the partners already on the
 * zero-cut program keep it. Both halves of that are failure modes if they slip —
 * a legacy partner silently acquiring a share is a broken promise, an operator
 * silently sitting at 0% is CANVEXIA working for free and never finding out.
 */
describe("partner revenue share", () => {
  describe("legacy tiers keep the zero-cut agreement", () => {
    it.each(["reseller", "affiliate"])("%s at 0%% is valid", (tier) => {
      expect(validateRevenueShare({ tier, revenueSharePct: 0 })).toEqual({ ok: true });
    });

    it.each(["reseller", "affiliate"])("%s with a share is rejected", (tier) => {
      const result = validateRevenueShare({ tier, revenueSharePct: 70 });
      expect(result.ok).toBe(false);
      // The message has to say what to do next, because the person hitting it is
      // trying to give a partner a share and needs to know it is a terms change.
      if (!result.ok) expect(result.error).toMatch(/operator/);
    });
  });

  describe("operators must carry a real share", () => {
    it("rejects 0 — the silent-zero trap", () => {
      const result = validateRevenueShare({ tier: "operator", revenueSharePct: 0 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/earns nothing/);
    });

    it("rejects a negative share", () => {
      expect(validateRevenueShare({ tier: "operator", revenueSharePct: -10 }).ok).toBe(false);
    });

    it("rejects 100% or more, which leaves CANVEXIA nothing", () => {
      expect(validateRevenueShare({ tier: "operator", revenueSharePct: 100 }).ok).toBe(false);
      expect(validateRevenueShare({ tier: "operator", revenueSharePct: 130 }).ok).toBe(false);
    });

    it("accepts the CANVEXIA default of 70", () => {
      expect(
        validateRevenueShare({ tier: "operator", revenueSharePct: DEFAULT_OPERATOR_SHARE_PCT }),
      ).toEqual({ ok: true });
      expect(DEFAULT_OPERATOR_SHARE_PCT).toBe(70);
    });

    it("accepts a negotiated share either side of the default", () => {
      expect(validateRevenueShare({ tier: "operator", revenueSharePct: 65 }).ok).toBe(true);
      expect(validateRevenueShare({ tier: "operator", revenueSharePct: 80 }).ok).toBe(true);
    });

    it("rejects a fractional percentage", () => {
      expect(validateRevenueShare({ tier: "operator", revenueSharePct: 70.5 }).ok).toBe(false);
    });
  });

  it("rejects an unknown tier rather than defaulting it", () => {
    expect(validateRevenueShare({ tier: "partner", revenueSharePct: 70 }).ok).toBe(false);
  });

  describe("tier predicates", () => {
    it("classifies the tiers that exist on live rows", () => {
      expect(isLegacyTier("reseller")).toBe(true);
      expect(isLegacyTier("affiliate")).toBe(true);
      expect(isLegacyTier("operator")).toBe(false);
      expect(isOperatorTier("operator")).toBe(true);
    });
  });

  describe("splitRevenue", () => {
    it("splits 70/30 on a round amount", () => {
      // ₱999.00 = 99900 centavos
      expect(splitRevenue(99900, 70)).toEqual({ partner: 69930, hq: 29970 });
    });

    it("never loses or duplicates a centavo to rounding", () => {
      // 333 splits to 233.1 / 99.9 — somebody has to absorb the tenth.
      const { partner, hq } = splitRevenue(333, 70);
      expect(partner + hq).toBe(333);
      expect(Number.isInteger(partner)).toBe(true);
      expect(Number.isInteger(hq)).toBe(true);
    });

    it("sums back to the original across a spread of awkward amounts", () => {
      for (const amount of [1, 3, 7, 99, 101, 12345, 99999, 100001]) {
        for (const pct of [65, 70, 80, 33]) {
          const { partner, hq } = splitRevenue(amount, pct);
          expect(partner + hq).toBe(amount);
        }
      }
    });

    it("gives a legacy partner nothing and HQ everything", () => {
      expect(splitRevenue(99900, 0)).toEqual({ partner: 0, hq: 99900 });
    });

    it("rejects a non-integer amount rather than silently rounding money", () => {
      expect(() => splitRevenue(99.5, 70)).toThrow();
      expect(() => splitRevenue(-100, 70)).toThrow();
    });
  });
});
