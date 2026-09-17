import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readingTotals, expectedCash, overShort, type ReadingSale } from "@/lib/pharmacy/reading";

/**
 * WAVE 4 — cashier shifts and BIR X/Z readings.
 *
 * A till that cannot be closed off is a till nobody can reconcile. Before this
 * a pharmacy could ring up sales all day with no record of who was on the
 * register, what cash it opened with, or whether the drawer was over or short —
 * and no Z-reading, which a registered POS is required to produce.
 */

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

function sale(over: Partial<ReadingSale> = {}): ReadingSale {
  return {
    subtotalCentavos: 11200,
    discountCentavos: 0,
    totalCentavos: 11200,
    vatExemptCentavos: 0,
    paymentMethod: "cash",
    status: "completed",
    receiptNumber: "00000001",
    ...over,
  };
}

describe("VAT is backed out of a VAT-inclusive price", () => {
  it("takes 12/112 of the total, not 12/100", () => {
    // Philippine shelf prices include VAT. Getting this backwards overstates
    // the tax by ~12% of itself on every return.
    const t = readingTotals([sale({ totalCentavos: 11200 })], 12);
    expect(t.vatCentavos).toBe(1200);
    expect(t.vatableCentavos).toBe(10000);
    expect(t.vatableCentavos + t.vatCentavos).toBe(t.netCentavos);
  });

  it("removes the SC/PWD portion from the taxable base entirely", () => {
    // An SC/PWD sale is exempt in full — removed from the base, not taxed and
    // then credited.
    const t = readingTotals(
      [sale({ totalCentavos: 10000, vatExemptCentavos: 10000 })],
      12,
    );
    expect(t.vatCentavos).toBe(0);
    expect(t.vatableCentavos).toBe(0);
    expect(t.vatExemptCentavos).toBe(10000);
  });

  it("charges no VAT at a zero rate", () => {
    const t = readingTotals([sale()], 0);
    expect(t.vatCentavos).toBe(0);
    expect(t.vatableCentavos).toBe(t.netCentavos);
  });

  it("never produces a negative taxable base", () => {
    // An exempt figure larger than the total is a data error; a negative tax
    // base is a worse answer than zero.
    const t = readingTotals([sale({ totalCentavos: 5000, vatExemptCentavos: 9000 })], 12);
    expect(t.vatableCentavos).toBe(0);
    expect(t.vatCentavos).toBe(0);
  });
});

describe("a voided sale is not a sale", () => {
  it("is counted but contributes no money", () => {
    const t = readingTotals([sale(), sale({ status: "voided", receiptNumber: "00000002" })], 12);
    expect(t.salesCount).toBe(1);
    expect(t.voidedCount).toBe(1);
    expect(t.netCentavos).toBe(11200);
  });
});

describe("the tender breakdown", () => {
  it("splits by payment method", () => {
    const t = readingTotals(
      [
        sale({ paymentMethod: "cash", totalCentavos: 10000 }),
        sale({ paymentMethod: "gcash", totalCentavos: 5000, receiptNumber: "00000002" }),
        sale({ paymentMethod: "card", totalCentavos: 2500, receiptNumber: "00000003" }),
      ],
      12,
    );
    expect(t.cashCentavos).toBe(10000);
    expect(t.gcashCentavos).toBe(5000);
    expect(t.cardCentavos).toBe(2500);
  });

  it("puts an unrecognised method in `other` rather than losing it", () => {
    // A reading whose tenders silently do not add up to the net is worse than
    // one with a visible "other" line.
    const t = readingTotals([sale({ paymentMethod: "cheque", totalCentavos: 9000 })], 12);
    expect(t.otherCentavos).toBe(9000);
    const tenders =
      t.cashCentavos + t.cardCentavos + t.gcashCentavos + t.mayaCentavos + t.otherCentavos;
    expect(tenders).toBe(t.netCentavos);
  });

  it("records the receipt range, which is what makes the series auditable", () => {
    const t = readingTotals(
      [sale({ receiptNumber: "00000007" }), sale({ receiptNumber: "00000003" })],
      12,
    );
    expect(t.firstReceiptNumber).toBe("00000003");
    expect(t.lastReceiptNumber).toBe("00000007");
  });
});

describe("reconciling the drawer", () => {
  it("expects the float plus the CASH taken, not the day's total", () => {
    // Reconciling against the total shows every GCash sale as a shortage.
    expect(expectedCash(100000, 45000)).toBe(145000);
  });

  it("reports a shortage as a negative number", () => {
    // The direction anybody reading it will assume, so it must be the one it is.
    expect(overShort(140000, 145000)).toBe(-5000);
    expect(overShort(150000, 145000)).toBe(5000);
    expect(overShort(145000, 145000)).toBe(0);
  });
});

describe("shifts", () => {
  const server = src("server/pharmacy/shifts.ts");
  const sale = src("server/pharmacy/sale.ts");

  it("allows only one open shift per pharmacy", () => {
    // Two open shifts means two drawers reconciled against the same sales.
    expect(server).toContain("A shift is already open. Close it first.");
  });

  it("resolves the open shift inside the sale's own transaction", () => {
    // A till id travelling through the browser is a till id somebody can
    // change; and reading it outside the transaction lets a shift closed in
    // between capture this receipt.
    expect(sale).toContain("const openShift = await tx.pharmacyShift.findFirst({");
    expect(sale).toContain("shiftId: openShift?.id ?? null,");
  });

  it("takes the Z number from the pharmacy counter, never a row count", () => {
    // "Sequential and non-resettable" is precisely the property being claimed;
    // a count would reissue a number if a row were ever removed.
    expect(server).toContain("data: { nextZNo: { increment: 1 } }");
  });

  it("snapshots the reconciliation onto the shift", () => {
    // A figure recomputed next week, after a sale was voided, is not a
    // reconciliation.
    expect(server).toContain("expectedCashCentavos: expected");
    expect(server).toContain("overShortCentavos: diff");
  });

  it("cuts the Z and closes the shift in one transaction", () => {
    const reading = server.indexOf("tx.pharmacyReading.create");
    const close = server.indexOf("tx.pharmacyShift.update");
    expect(reading).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(reading);
  });

  it("refuses to close an already-closed shift", () => {
    expect(server).toContain('if (shift.status === "closed")');
  });

  it("can produce a reading without a shift, by time window", () => {
    // A pharmacy that has not adopted shifts still has to be able to take a
    // reading; refusing is the sort of purity that gets a system replaced by
    // a notebook.
    expect(server).toContain("createdAt: { gte: input.from, lt: input.to }");
  });
});

describe("opening and closing a till", () => {
  const actions = src("app/shift/actions.ts");

  it("refuses a blank float rather than defaulting it to zero", () => {
    // Otherwise every unattended form produces a drawer that "started empty".
    expect(actions).toContain("Count the float and enter it, even if it is zero.");
    expect(actions).toContain('if (v === "") return null;');
  });

  it("lets the cashier open their own till", () => {
    // Requiring a manager means the till is opened by whoever is nearest to a
    // manager's password, which is worse than not recording it.
    expect(actions).toContain('requireStaff("sell")');
  });
});
