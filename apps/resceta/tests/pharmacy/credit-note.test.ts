import { describe, it, expect } from "vitest";
import {
  grossReturned,
  creditNoteSummary,
  creditVatBox,
  buildCreditNote,
  type CreditNoteInput,
  type CreditNoteLineInput,
} from "@/lib/pharmacy/credit-note";
import { totalSale } from "@/lib/pharmacy/discount";
import { proratedRefund } from "@/lib/pharmacy/reversal";
import type { PharmacyIdentity } from "@/lib/pharmacy/receipt";

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

function line(over: Partial<CreditNoteLineInput> = {}): CreditNoteLineInput {
  return {
    productName: "Biogesic 500mg",
    generic: "Paracetamol",
    lotNumber: "LOT-A",
    expiry: new Date("2027-03-01T00:00:00+08:00"),
    quantity: 1,
    unitPriceCentavos: 11200,
    lineTotalCentavos: 11200,
    disposition: "destroyed",
    ...over,
  };
}

function note(over: Partial<CreditNoteInput> = {}): CreditNoteInput {
  return {
    returnNumber: "CN00000001",
    createdAt: new Date("2026-09-15T10:00:00+08:00"),
    reason: "Wrong item",
    refundMethod: "cash",
    refundCentavos: 11200,
    processedBy: "Ana Cruz",
    sale: {
      receiptNumber: "00000001",
      createdAt: new Date("2026-09-14T09:00:00+08:00"),
      subtotalCentavos: 11200,
      totalCentavos: 11200,
      vatExemptCentavos: 0,
      discountType: "none",
      beneficiaryIdNo: null,
      beneficiaryName: null,
    },
    items: [line()],
    ...over,
  };
}

describe("goods coming back", () => {
  it("totals the lines at the prices charged", () => {
    expect(grossReturned([line(), line({ lineTotalCentavos: 500 })])).toBe(11700);
  });

  it("is zero for an empty note", () => {
    expect(grossReturned([])).toBe(0);
  });
});

describe("the printed summary", () => {
  it("is one row when the refund equals the goods", () => {
    expect(creditNoteSummary(11200, 11200, "none")).toEqual([
      { label: "Amount refunded", centavos: 11200, kind: "due" },
    ]);
  });

  it("shows the gap as its own labelled row on a discounted sale", () => {
    // THE POINT. ₱112.00 of goods come back; ₱80.00 goes out, because ₱80.00 is
    // what was paid. Printing ₱112.00 as the credit would overstate the
    // reversal by exactly the discount — the receipt's bug in mirror image.
    const rows = creditNoteSummary(11200, 8000, "sc");
    expect(rows.map((r) => r.kind)).toEqual(["subtotal", "deduction", "due"]);
    expect(rows[0].centavos).toBe(11200);
    expect(rows[1]).toMatchObject({
      label: "Less Senior Citizen discount on the original sale",
      centavos: 3200,
    });
    expect(rows[2]).toMatchObject({ label: "Amount refunded", centavos: 8000 });
  });

  it("names PWD as PWD, and a plain discount plainly", () => {
    expect(creditNoteSummary(11200, 8000, "pwd")[1].label).toBe(
      "Less Person With Disability discount on the original sale",
    );
    expect(creditNoteSummary(1000, 800, "manual")[1].label).toBe(
      "Less discount on the original sale",
    );
  });

  it("always sums: goods minus the deduction is the refund", () => {
    for (let gross = 0; gross <= 200000; gross += 1301) {
      for (const ratio of [1, 0.8, 0.5, 0]) {
        const refund = Math.round(gross * ratio);
        const rows = creditNoteSummary(gross, refund, "sc");
        const deductions = rows
          .filter((r) => r.kind === "deduction")
          .reduce((s, r) => s + r.centavos, 0);
        const subtotal = rows.find((r) => r.kind === "subtotal")?.centavos ?? refund;
        expect(subtotal - deductions).toBe(rows.at(-1)!.centavos);
      }
    }
  });

  it("refuses to credit more than came back, even on bad data", () => {
    expect(creditNoteSummary(1000, 9999, "none").at(-1)!.centavos).toBe(1000);
    expect(creditNoteSummary(1000, -50, "none").at(-1)!.centavos).toBe(0);
  });

  it("ends on the refund in every shape", () => {
    for (const [g, r] of [[11200, 11200], [11200, 8000], [500, 0]] as const) {
      expect(creditNoteSummary(g, r, "sc").at(-1)!.kind).toBe("due");
    }
  });
});

describe("the VAT on a credit note", () => {
  it("mirrors an ordinary sale: the refund carries VAT back out", () => {
    const box = creditVatBox(11200, { vatExemptCentavos: 0 }, 12);
    expect(box).toMatchObject({ vatableSalesCentavos: 10000, vatCentavos: 1200 });
  });

  it("mirrors an exempt sale: exempt in full, no VAT reclaimed", () => {
    // Reclaiming output VAT that was never charged would understate the return.
    const box = creditVatBox(8000, { vatExemptCentavos: 8000 }, 12);
    expect(box).toMatchObject({
      vatableSalesCentavos: 0,
      vatCentavos: 0,
      vatExemptCentavos: 8000,
    });
  });

  it("reconciles to the refund", () => {
    for (const exempt of [0, 1]) {
      for (let refund = 0; refund <= 100000; refund += 733) {
        const box = creditVatBox(refund, { vatExemptCentavos: exempt ? refund : 0 }, 12);
        expect(
          box.vatableSalesCentavos + box.vatCentavos + box.vatExemptCentavos + box.zeroRatedCentavos,
        ).toBe(refund);
      }
    }
  });
});

describe("end to end against the real sale arithmetic", () => {
  it("agrees with what the till charged and what the reversal refunds", () => {
    // The whole chain: totalSale prices an SC cart, proratedRefund decides the
    // refund, and the credit note prints both without inventing a third number.
    const cart = [
      { unitPriceCentavos: 1333, quantity: 3 },
      { unitPriceCentavos: 799, quantity: 7 },
    ];
    const totals = totalSale(cart, { discountType: "sc", vatRatePct: 12 });
    const gross = cart.reduce((s, l) => s + l.unitPriceCentavos * l.quantity, 0);
    const refund = proratedRefund(gross, totals);

    const rows = creditNoteSummary(gross, refund, "sc");
    expect(rows.at(-1)!.centavos).toBe(refund);
    // Returning the whole cart refunds exactly what was taken for it.
    expect(refund).toBe(totals.totalCentavos);
  });
});

describe("the document", () => {
  it("names the invoice it corrects", () => {
    // A credit note that does not point at a receipt cannot be reconciled.
    const doc = buildCreditNote(COMPLETE, note());
    expect(doc.correcting.receiptNumber).toBe("00000001");
    expect(doc.correcting.issuedAt).toEqual(new Date("2026-09-14T09:00:00+08:00"));
  });

  it("is official only when the pharmacy's own details are on file", () => {
    expect(buildCreditNote(COMPLETE, note()).isOfficial).toBe(true);
    const bare = buildCreditNote({ ...COMPLETE, tin: null }, note());
    expect(bare.isOfficial).toBe(false);
    expect(bare.gaps.map((g) => g.field)).toEqual(["tin"]);
  });

  it("does not demand a beneficiary ID of an ordinary return", () => {
    // receiptGaps would; identityGaps is the right question for this document.
    expect(buildCreditNote(COMPLETE, note()).gaps).toEqual([]);
  });

  it("carries the beneficiary from the original sale", () => {
    const doc = buildCreditNote(
      COMPLETE,
      note({
        refundCentavos: 8000,
        sale: {
          ...note().sale,
          discountType: "sc",
          totalCentavos: 8000,
          vatExemptCentavos: 8000,
          beneficiaryIdNo: "SC-99887",
          beneficiaryName: "Rosario Dela Cruz",
        },
      }),
    );
    expect(doc.beneficiary).toEqual({
      label: "Senior Citizen",
      name: "Rosario Dela Cruz",
      idNo: "SC-99887",
    });
    expect(doc.vat!.vatExemptCentavos).toBe(8000);
  });

  it("has no beneficiary block on an ordinary return", () => {
    expect(buildCreditNote(COMPLETE, note()).beneficiary).toBeNull();
  });

  it("drops the VAT box for a pharmacy that is not VAT-registered", () => {
    const doc = buildCreditNote({ ...COMPLETE, vatRatePct: 0 }, note());
    expect(doc.vat).toBeNull();
    expect(doc.vatRegistered).toBe(false);
  });

  it("keeps the lot and the disposition on every line", () => {
    // What came back, from which lot, and what was done with it. A recall names
    // a lot; an inspection asks what happened to the goods.
    const doc = buildCreditNote(
      COMPLETE,
      note({ items: [line({ disposition: "restocked" })] }),
    );
    expect(doc.lines[0]).toMatchObject({ lotNumber: "LOT-A", disposition: "restocked" });
  });

  it("prefers the trading name", () => {
    expect(
      buildCreditNote({ ...COMPLETE, displayName: "Resceta Quimpo" }, note()).title,
    ).toBe("Resceta Quimpo");
  });
});
