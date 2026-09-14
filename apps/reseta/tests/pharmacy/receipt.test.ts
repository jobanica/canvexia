import { describe, it, expect } from "vitest";
import {
  vatBreakdown,
  statutorySplit,
  summaryRows,
  receiptGaps,
  buildReceipt,
  type PharmacyIdentity,
  type ReceiptSaleInput,
} from "@/lib/pharmacy/receipt";
import { totalSale } from "@/lib/pharmacy/discount";

const COMPLETE: PharmacyIdentity = {
  name: "CANVEXIA Pharmacy Davao",
  displayName: null,
  address: "12 Quimpo Blvd, Davao City",
  phone: "0917 000 0000",
  tin: "123-456-789-00000",
  fdaLtoNumber: "LTO-CDRRHR-2026-0001",
  prcLicenseNo: "PRC-0012345",
  vatRatePct: 12,
};

function sale(over: Partial<ReceiptSaleInput> = {}): ReceiptSaleInput {
  return {
    receiptNumber: "00000001",
    createdAt: new Date("2026-09-14T09:00:00+08:00"),
    status: "completed",
    subtotalCentavos: 11200,
    discountCentavos: 0,
    totalCentavos: 11200,
    vatExemptCentavos: 0,
    discountType: "none",
    beneficiaryIdNo: null,
    beneficiaryName: null,
    paymentMethod: "cash",
    tenderedCentavos: 11200,
    changeCentavos: 0,
    prescriptionRef: null,
    soldBy: "Ana Cruz",
    items: [
      {
        nameAtTime: "Biogesic 500mg",
        genericAtTime: "Paracetamol",
        lotNumberAtTime: "LOT-A",
        expiryAtTime: new Date("2027-03-01T00:00:00+08:00"),
        quantity: 10,
        unitPriceCentavos: 1120,
        lineTotalCentavos: 11200,
      },
    ],
    ...over,
  };
}

describe("the VAT box", () => {
  it("splits a VAT-inclusive total into net and VAT", () => {
    // ₱112.00 inclusive of 12% is ₱100.00 + ₱12.00.
    const box = vatBreakdown(11200, 0, 12);
    expect(box.vatableSalesCentavos).toBe(10000);
    expect(box.vatCentavos).toBe(1200);
    expect(box.vatExemptCentavos).toBe(0);
  });

  it("puts an SC/PWD sale entirely in the exempt row", () => {
    // Not "exempt AND vatable" — the sale is exempt in full, so imputing VAT to
    // any part of it would overstate output tax on the return.
    const box = vatBreakdown(8000, 8000, 12);
    expect(box).toMatchObject({
      vatableSalesCentavos: 0,
      vatCentavos: 0,
      vatExemptCentavos: 8000,
    });
  });

  it("always adds up to the amount due", () => {
    // The invariant that makes the printed box worth printing: a box that does
    // not reconcile to the total is a filing that does not reconcile either.
    for (let total = 0; total <= 500000; total += 977) {
      for (const exempt of [0, total]) {
        const box = vatBreakdown(total, exempt, 12);
        const sum =
          box.vatableSalesCentavos +
          box.vatCentavos +
          box.vatExemptCentavos +
          box.zeroRatedCentavos;
        expect(sum).toBe(total);
      }
    }
  });

  it("charges no VAT at a zero rate", () => {
    expect(vatBreakdown(11200, 0, 0)).toMatchObject({
      vatableSalesCentavos: 11200,
      vatCentavos: 0,
    });
  });

  it("cannot be talked into a negative row by bad data", () => {
    expect(vatBreakdown(-100, 0, 12).vatableSalesCentavos).toBe(0);
    // An exempt figure larger than the total is capped, not subtracted past zero.
    expect(vatBreakdown(5000, 9999, 12)).toMatchObject({
      vatExemptCentavos: 5000,
      vatCentavos: 0,
    });
  });
});

describe("the SC/PWD split", () => {
  it("shows the statutory discount as 20%, not as the whole reduction", () => {
    // THE POINT OF THIS MODULE. ₱112.00 shelf, beneficiary pays ₱80.00, so the
    // stored discount is ₱32.00 — but ₱12.00 of that is VAT removal. Printing
    // ₱32.00 as "20% discount" states a 28.6% discount, and ₱32.00 is not what
    // the pharmacy may claim as a tax deduction.
    const split = statutorySplit(11200, 8000, 12);
    expect(split.vatDeductedCentavos).toBe(1200);
    expect(split.netOfVatCentavos).toBe(10000);
    expect(split.statutoryDiscountCentavos).toBe(2000);
    expect(split.amountDueCentavos).toBe(8000);
  });

  it("reconciles: the two deductions are exactly the stored discount", () => {
    const split = statutorySplit(11200, 8000, 12);
    expect(split.vatDeductedCentavos + split.statutoryDiscountCentavos).toBe(11200 - 8000);
  });

  it("agrees with what the till actually charged, rounding and all", () => {
    // The receipt is derived from the STORED totals, never recomputed from the
    // lines — totalSale rounds per line, and the receipt has to show the money
    // that changed hands, not a tidier number.
    const lines = [
      { unitPriceCentavos: 1333, quantity: 3 },
      { unitPriceCentavos: 799, quantity: 7 },
      { unitPriceCentavos: 4550, quantity: 1 },
    ];
    const totals = totalSale(lines, { discountType: "sc", vatRatePct: 12 });
    const split = statutorySplit(totals.subtotalCentavos, totals.totalCentavos, 12);

    expect(split.amountDueCentavos).toBe(totals.totalCentavos);
    expect(split.vatDeductedCentavos + split.statutoryDiscountCentavos).toBe(
      totals.discountCentavos,
    );
    // And the residual really is ~20% of the VAT-exclusive base: drift from
    // per-line rounding is centavos, not percent.
    const implied = split.statutoryDiscountCentavos / split.netOfVatCentavos;
    expect(implied).toBeGreaterThan(0.199);
    expect(implied).toBeLessThan(0.201);
  });

  it("reconciles across a wide range of shelf prices", () => {
    for (let unit = 1; unit <= 20000; unit += 137) {
      for (const qty of [1, 3, 17]) {
        const totals = totalSale([{ unitPriceCentavos: unit, quantity: qty }], {
          discountType: "pwd",
          vatRatePct: 12,
        });
        const split = statutorySplit(totals.subtotalCentavos, totals.totalCentavos, 12);
        expect(split.amountDueCentavos).toBe(totals.totalCentavos);
        expect(split.vatDeductedCentavos + split.statutoryDiscountCentavos).toBe(
          totals.subtotalCentavos - totals.totalCentavos,
        );
      }
    }
  });

  it("takes the 20% off the gross when there is no VAT to remove", () => {
    const split = statutorySplit(10000, 8000, 0);
    expect(split.vatDeductedCentavos).toBe(0);
    expect(split.netOfVatCentavos).toBe(10000);
    expect(split.statutoryDiscountCentavos).toBe(2000);
  });
});

describe("the printed summary", () => {
  it("is one row when nothing was discounted", () => {
    expect(summaryRows(sale(), 12)).toEqual([
      { label: "Amount due", centavos: 11200, kind: "due" },
    ]);
  });

  it("is three rows for a manual discount", () => {
    const rows = summaryRows(
      sale({ discountType: "manual", discountCentavos: 1200, totalCentavos: 10000 }),
      12,
    );
    expect(rows.map((r) => r.kind)).toEqual(["subtotal", "deduction", "due"]);
    expect(rows[1]).toMatchObject({ label: "Less discount", centavos: 1200 });
    expect(rows.at(-1)).toMatchObject({ centavos: 10000, kind: "due" });
  });

  it("is the statutory five for an SC sale, VAT removed before the discount", () => {
    const rows = summaryRows(
      sale({ discountType: "sc", discountCentavos: 3200, totalCentavos: 8000 }),
      12,
    );
    expect(rows.map((r) => r.label)).toEqual([
      "Total (VAT-inclusive)",
      "Less VAT (12%)",
      "Total (VAT-exempt)",
      "Less 20% Senior Citizen discount",
      "Amount due",
    ]);
    expect(rows.map((r) => r.centavos)).toEqual([11200, 1200, 10000, 2000, 8000]);
  });

  it("names PWD as PWD", () => {
    const rows = summaryRows(
      sale({ discountType: "pwd", discountCentavos: 3200, totalCentavos: 8000 }),
      12,
    );
    expect(rows[3].label).toBe("Less 20% Person With Disability discount");
  });

  it("drops the VAT rows for a pharmacy that is not VAT-registered", () => {
    const rows = summaryRows(
      sale({ discountType: "sc", discountCentavos: 2240, totalCentavos: 8960 }),
      0,
    );
    expect(rows.map((r) => r.label)).toEqual([
      "Subtotal",
      "Less 20% Senior Citizen discount",
      "Amount due",
    ]);
  });

  it("ends on the amount due, in every shape", () => {
    for (const s of [
      sale(),
      sale({ discountType: "manual", discountCentavos: 500, totalCentavos: 10700 }),
      sale({ discountType: "sc", discountCentavos: 3200, totalCentavos: 8000 }),
    ]) {
      const rows = summaryRows(s, 12);
      expect(rows.at(-1)!.kind).toBe("due");
      expect(rows.at(-1)!.centavos).toBe(s.totalCentavos);
    }
  });
});

describe("what the receipt is missing", () => {
  it("finds nothing wrong with a complete one", () => {
    expect(receiptGaps(COMPLETE, sale())).toEqual([]);
  });

  it("names the TIN, the address, the LTO and the PRC number", () => {
    const bare: PharmacyIdentity = {
      ...COMPLETE,
      tin: null,
      address: null,
      fdaLtoNumber: null,
      prcLicenseNo: null,
    };
    expect(receiptGaps(bare, sale()).map((g) => g.field)).toEqual([
      "tin",
      "address",
      "fdaLtoNumber",
      "prcLicenseNo",
    ]);
  });

  it("treats whitespace as missing", () => {
    expect(receiptGaps({ ...COMPLETE, tin: "   " }, sale())[0].field).toBe("tin");
  });

  it("wants the beneficiary named on a statutory sale, not just ID'd", () => {
    const gaps = receiptGaps(COMPLETE, {
      discountType: "sc",
      beneficiaryIdNo: "SC-12345",
      beneficiaryName: null,
    });
    expect(gaps.map((g) => g.field)).toEqual(["beneficiaryName"]);
  });

  it("asks for neither on an ordinary sale", () => {
    expect(
      receiptGaps(COMPLETE, {
        discountType: "none",
        beneficiaryIdNo: null,
        beneficiaryName: null,
      }),
    ).toEqual([]);
  });

  it("says WHY, not just what", () => {
    // The person reading this is being asked to go and find a document.
    for (const gap of receiptGaps({ ...COMPLETE, tin: null, fdaLtoNumber: null }, sale())) {
      expect(gap.why.length).toBeGreaterThan(20);
    }
  });
});

describe("the document", () => {
  it("is official only when nothing required is missing", () => {
    expect(buildReceipt(COMPLETE, sale()).isOfficial).toBe(true);
    expect(buildReceipt({ ...COMPLETE, tin: null }, sale()).isOfficial).toBe(false);
  });

  it("marks a voided receipt as voided", () => {
    // A reprint of a voided sale that does not say so is the hazard here.
    expect(buildReceipt(COMPLETE, sale({ status: "voided" })).voided).toBe(true);
    expect(buildReceipt(COMPLETE, sale()).voided).toBe(false);
  });

  it("prefers the trading name, falling back to the registered one", () => {
    expect(buildReceipt(COMPLETE, sale()).title).toBe("CANVEXIA Pharmacy Davao");
    expect(
      buildReceipt({ ...COMPLETE, displayName: "Reseta Quimpo" }, sale()).title,
    ).toBe("Reseta Quimpo");
    expect(buildReceipt({ ...COMPLETE, displayName: "  " }, sale()).title).toBe(
      "CANVEXIA Pharmacy Davao",
    );
  });

  it("has no VAT box at all when the pharmacy is not VAT-registered", () => {
    // A box of zeros reads as "VAT-registered, sold nothing VATable", which is
    // a different statement from "not VAT-registered".
    const doc = buildReceipt({ ...COMPLETE, vatRatePct: 0 }, sale());
    expect(doc.vat).toBeNull();
    expect(doc.vatRegistered).toBe(false);
  });

  it("carries the beneficiary block on a statutory sale and not otherwise", () => {
    expect(buildReceipt(COMPLETE, sale()).beneficiary).toBeNull();
    expect(
      buildReceipt(
        COMPLETE,
        sale({
          discountType: "sc",
          discountCentavos: 3200,
          totalCentavos: 8000,
          vatExemptCentavos: 8000,
          beneficiaryIdNo: "SC-12345",
          beneficiaryName: "Rosario Dela Cruz",
        }),
      ).beneficiary,
    ).toEqual({
      kind: "sc",
      label: "Senior Citizen",
      name: "Rosario Dela Cruz",
      idNo: "SC-12345",
    });
  });

  it("shows the VAT box and the summary telling the same story", () => {
    const doc = buildReceipt(
      COMPLETE,
      sale({
        discountType: "sc",
        discountCentavos: 3200,
        totalCentavos: 8000,
        vatExemptCentavos: 8000,
      }),
    );
    const due = doc.summary.at(-1)!.centavos;
    expect(doc.vat!.vatExemptCentavos).toBe(due);
    expect(doc.vat!.vatCentavos).toBe(0);
  });

  it("keeps the lot number and expiry on every line", () => {
    // The recall trail. A receipt is often the only copy the customer has.
    const line = buildReceipt(COMPLETE, sale()).lines[0];
    expect(line.lotNumberAtTime).toBe("LOT-A");
    expect(line.expiryAtTime).toBeInstanceOf(Date);
  });
});
