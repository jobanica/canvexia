import { describe, it, expect } from "vitest";
import { earnings, peso, PARTNER_SHARE } from "@/lib/earnings";

describe("the calculator", () => {
  it("matches the figure in the brief: 30 merchants × ₱999", () => {
    const e = earnings(30, 999);
    expect(e.grossMonthly).toBe(29970);
    expect(e.partnerMonthly).toBe(20979);
    expect(e.hqMonthly).toBe(8991);
  });

  it("splits 70/30 with nothing lost between them", () => {
    // The two halves must add to the gross exactly. A rounding gap here is a
    // page that shows a partner a number the invoice will not match.
    for (let m = 0; m <= 100; m++) {
      for (const price of [999, 1499, 750, 1]) {
        const e = earnings(m, price);
        expect(e.partnerMonthly + e.hqMonthly).toBe(e.grossMonthly);
      }
    }
  });

  it("never quotes a partner more than they would get", () => {
    // 1 × ₱999 × 0.7 = 699.3. Floor, not round: 699.
    expect(earnings(1, 999).partnerMonthly).toBe(699);
    expect(earnings(1, 999).hqMonthly).toBe(300);
  });

  it("is zero at zero, rather than NaN or a negative", () => {
    expect(earnings(0, 999)).toMatchObject({ grossMonthly: 0, partnerMonthly: 0, hqMonthly: 0 });
    expect(earnings(-5, -100)).toMatchObject({ grossMonthly: 0, partnerMonthly: 0 });
  });

  it("ignores a fractional merchant count", () => {
    expect(earnings(30.9, 999).merchants).toBe(30);
  });

  it("implies three visits per merchant, as the brief states", () => {
    expect(earnings(30, 999).visitsImplied).toBe(90);
  });

  it("yearly is twelve times monthly, not the gross", () => {
    expect(earnings(30, 999).partnerYearly).toBe(20979 * 12);
  });

  it("keeps the share at 70%", () => {
    expect(PARTNER_SHARE).toBe(0.7);
  });
});

describe("peso formatting", () => {
  it("groups thousands and drops decimals", () => {
    expect(peso(20979)).toBe("₱20,979");
    expect(peso(999)).toBe("₱999");
    expect(peso(1000000)).toBe("₱1,000,000");
  });

  it("shows zero as zero", () => {
    expect(peso(0)).toBe("₱0");
  });
});
