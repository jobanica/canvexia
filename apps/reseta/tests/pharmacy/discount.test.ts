import { describe, it, expect } from "vitest";
import {
  statutoryLineDiscount,
  totalSale,
  isStatutory,
} from "@/lib/pharmacy/discount";

/**
 * The SC/PWD arithmetic is statute. These numbers are not preferences, so the
 * tests assert the law rather than the implementation — most of all the one
 * mistake this calculation invites.
 */
describe("Senior Citizen / PWD pricing", () => {
  const VAT = 12;

  it("takes the 20% off the VAT-EXCLUSIVE price, not the shelf price", () => {
    // ₱112.00 shelf, VAT-inclusive at 12% → ₱100.00 net of VAT → ₱80.00 to pay.
    // The discount is therefore ₱32.00, not ₱22.40.
    expect(statutoryLineDiscount(11200, 1, VAT)).toBe(3200);
  });

  it("is NOT price * 0.8 — the wrong formula overcharges on every line", () => {
    const shelf = 11200;
    const correct = statutoryLineDiscount(shelf, 1, VAT);
    const naive = Math.round(shelf * 0.2);
    expect(correct).toBeGreaterThan(naive);
    // Naive nets ₱89.60, correct nets ₱80.00. The ₱9.60 gap is exactly the VAT
    // on the discounted price — which is the point: the naive formula never
    // takes the VAT off, so the beneficiary pays VAT they are exempt from.
    expect(shelf - naive).toBe(8960);
    expect(shelf - correct).toBe(8000);
    expect(correct - naive).toBe(Math.round(8000 * 0.12));
  });

  it("scales by quantity", () => {
    expect(statutoryLineDiscount(11200, 3, VAT)).toBe(9600);
  });

  it("reads the VAT rate off the merchant rather than assuming 12", () => {
    // Same shelf price under a 10% rate: net = round(11200/1.1*0.8) = 8145.
    expect(statutoryLineDiscount(11200, 1, 10)).toBe(11200 - 8145);
  });

  it("rounds the amount PAID to a whole centavo, not the discount", () => {
    // 999 / 1.12 * 0.8 = 713.57… → the customer pays 714, so discount is 285.
    expect(statutoryLineDiscount(999, 1, VAT)).toBe(999 - 714);
  });

  it("gives nothing away on a zero-price or zero-quantity line", () => {
    expect(statutoryLineDiscount(0, 5, VAT)).toBe(0);
    expect(statutoryLineDiscount(5000, 0, VAT)).toBe(0);
  });

  it("treats sc and pwd identically — both statutes give 20%", () => {
    const lines = [{ unitPriceCentavos: 11200, quantity: 2 }];
    const sc = totalSale(lines, { discountType: "sc", vatRatePct: VAT });
    const pwd = totalSale(lines, { discountType: "pwd", vatRatePct: VAT });
    expect(sc).toEqual(pwd);
    expect(isStatutory("sc")).toBe(true);
    expect(isStatutory("pwd")).toBe(true);
    expect(isStatutory("manual")).toBe(false);
  });
});

describe("totalling a sale", () => {
  const VAT = 12;

  it("sums lines and applies no discount by default", () => {
    const t = totalSale(
      [
        { unitPriceCentavos: 5000, quantity: 2 },
        { unitPriceCentavos: 2500, quantity: 1 },
      ],
      { discountType: "none", vatRatePct: VAT },
    );
    expect(t.subtotalCentavos).toBe(12500);
    expect(t.discountCentavos).toBe(0);
    expect(t.totalCentavos).toBe(12500);
  });

  it("marks an SC/PWD sale VAT-exempt in full, on the amount actually paid", () => {
    const t = totalSale([{ unitPriceCentavos: 11200, quantity: 1 }], {
      discountType: "sc",
      vatRatePct: VAT,
    });
    expect(t.totalCentavos).toBe(8000);
    expect(t.vatExemptCentavos).toBe(8000);
  });

  it("records no exemption on an ordinary sale", () => {
    const t = totalSale([{ unitPriceCentavos: 11200, quantity: 1 }], {
      discountType: "manual",
      vatRatePct: VAT,
      manualDiscountCentavos: 1000,
    });
    expect(t.vatExemptCentavos).toBe(0);
    expect(t.totalCentavos).toBe(10200);
  });

  it("caps a manual discount at the subtotal rather than paying the customer", () => {
    const t = totalSale([{ unitPriceCentavos: 1000, quantity: 1 }], {
      discountType: "manual",
      vatRatePct: VAT,
      manualDiscountCentavos: 999999,
    });
    expect(t.discountCentavos).toBe(1000);
    expect(t.totalCentavos).toBe(0);
  });

  it("ignores a negative manual discount instead of adding to the bill", () => {
    const t = totalSale([{ unitPriceCentavos: 1000, quantity: 1 }], {
      discountType: "manual",
      vatRatePct: VAT,
      manualDiscountCentavos: -5000,
    });
    expect(t.discountCentavos).toBe(0);
    expect(t.totalCentavos).toBe(1000);
  });

  it("ignores a manual amount when the discount is statutory", () => {
    const t = totalSale([{ unitPriceCentavos: 11200, quantity: 1 }], {
      discountType: "sc",
      vatRatePct: VAT,
      manualDiscountCentavos: 1,
    });
    expect(t.discountCentavos).toBe(3200);
  });
});
