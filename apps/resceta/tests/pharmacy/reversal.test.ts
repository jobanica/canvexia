import { describe, it, expect } from "vitest";
import {
  canVoid,
  checkReturn,
  returnableQuantity,
  proratedRefund,
  type SaleLineForReversal,
} from "@/lib/pharmacy/reversal";

const NOW = new Date("2026-09-14T14:00:00+08:00");

function line(over: Partial<SaleLineForReversal> = {}): SaleLineForReversal {
  return {
    saleItemId: "aaaaaaaa-0000-4000-8000-000000000001",
    productName: "Biogesic 500mg",
    lotNumber: "LOT-A",
    quantity: 10,
    unitPriceCentavos: 11200,
    alreadyReturned: 0,
    ...over,
  };
}

describe("voiding", () => {
  const sale = (over: Partial<Parameters<typeof canVoid>[0]> = {}) => ({
    status: "completed" as const,
    createdAt: new Date("2026-09-14T09:00:00+08:00"),
    returnCount: 0,
    ...over,
  });

  it("allows a void on the same business day", () => {
    expect(canVoid(sale(), NOW)).toEqual({ ok: true });
  });

  it("refuses one from an earlier day, and says what to do instead", () => {
    // A receipt is a reported figure. Voiding one from a closed day changes a
    // number that has been filed — which is exactly what a credit note exists
    // to avoid.
    const result = canVoid(sale({ createdAt: new Date("2026-09-13T22:00:00+08:00") }), NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("day_closed");
    expect(result.message).toMatch(/return/i);
  });

  it("judges the day in Manila, not the server's timezone", () => {
    // 2026-09-13T17:30Z is already 01:30 on the 14th in Manila. A sale rung up
    // then is the same business day as 09:00 on the 14th, and a UTC comparison
    // would call it yesterday and refuse.
    const lateNightManila = new Date("2026-09-13T17:30:00Z");
    expect(canVoid(sale({ createdAt: lateNightManila }), NOW).ok).toBe(true);
  });

  it("refuses to void twice", () => {
    expect(canVoid(sale({ status: "voided" }), NOW)).toMatchObject({
      ok: false,
      reason: "already_voided",
    });
  });

  it("refuses to void a sale that already has a credit note", () => {
    // It has already been partly undone; voiding as well gives the money back
    // twice.
    expect(canVoid(sale({ returnCount: 1 }), NOW)).toMatchObject({
      ok: false,
      reason: "has_returns",
    });
  });
});

describe("what is still returnable", () => {
  it("is everything on an untouched line", () => {
    expect(returnableQuantity(line())).toBe(10);
  });

  it("accounts for earlier returns", () => {
    expect(returnableQuantity(line({ alreadyReturned: 4 }))).toBe(6);
  });

  it("never goes negative, even on bad data", () => {
    expect(returnableQuantity(line({ quantity: 3, alreadyReturned: 5 }))).toBe(0);
  });
});

describe("checking a return", () => {
  it("accepts a partial return and prices it from the ORIGINAL line", () => {
    const result = checkReturn([line()], [{ saleItemId: line().saleItemId, quantity: 3 }]);
    expect(result.ok).toBe(true);
    expect(result.totalCentavos).toBe(33600);
    expect(result.lines[0]).toMatchObject({ quantity: 3, unitPriceCentavos: 11200 });
  });

  it("refuses more than was bought", () => {
    const result = checkReturn([line()], [{ saleItemId: line().saleItemId, quantity: 11 }]);
    expect(result.ok).toBe(false);
    expect(result.issues[0].message).toMatch(/Only 10/);
  });

  it("refuses more than is LEFT after an earlier return", () => {
    const result = checkReturn(
      [line({ alreadyReturned: 7 })],
      [{ saleItemId: line().saleItemId, quantity: 4 }],
    );
    expect(result.ok).toBe(false);
    expect(result.issues[0].message).toMatch(/Only 3/);
  });

  it("refuses a line that is already fully returned", () => {
    const result = checkReturn(
      [line({ alreadyReturned: 10 })],
      [{ saleItemId: line().saleItemId, quantity: 1 }],
    );
    expect(result.ok).toBe(false);
    expect(result.issues[0].message).toMatch(/already been returned in full/);
  });

  it("refuses an item that is not on the receipt", () => {
    const result = checkReturn(
      [line()],
      [{ saleItemId: "bbbbbbbb-0000-4000-8000-000000000002", quantity: 1 }],
    );
    expect(result.ok).toBe(false);
    expect(result.issues[0].message).toMatch(/isn't on this receipt/);
  });

  it("catches the same line listed twice", () => {
    // Each would pass on its own and overdraw together.
    const id = line().saleItemId;
    const result = checkReturn(
      [line({ quantity: 5 })],
      [
        { saleItemId: id, quantity: 3 },
        { saleItemId: id, quantity: 3 },
      ],
    );
    expect(result.ok).toBe(false);
    expect(result.issues[0].message).toMatch(/twice/);
  });

  it("refuses an empty request rather than writing an empty credit note", () => {
    expect(checkReturn([line()], []).ok).toBe(false);
    expect(checkReturn([line()], [{ saleItemId: line().saleItemId, quantity: 0 }]).ok).toBe(false);
  });

  it("carries the restock flag through, defaulting to false", () => {
    const id = line().saleItemId;
    expect(checkReturn([line()], [{ saleItemId: id, quantity: 1 }]).lines[0].restock).toBe(false);
    expect(
      checkReturn([line()], [{ saleItemId: id, quantity: 1, restock: true }]).lines[0].restock,
    ).toBe(true);
  });

  it("totals across several lines", () => {
    const a = line({ saleItemId: "aaaaaaaa-0000-4000-8000-000000000001", unitPriceCentavos: 1000 });
    const b = line({ saleItemId: "bbbbbbbb-0000-4000-8000-000000000002", unitPriceCentavos: 2500 });
    const result = checkReturn(
      [a, b],
      [
        { saleItemId: a.saleItemId, quantity: 2 },
        { saleItemId: b.saleItemId, quantity: 1 },
      ],
    );
    expect(result.ok).toBe(true);
    expect(result.totalCentavos).toBe(4500);
  });
});

describe("what the customer actually gets back", () => {
  it("refunds the full amount when nothing was discounted", () => {
    expect(proratedRefund(10000, { subtotalCentavos: 50000, totalCentavos: 50000 })).toBe(10000);
  });

  it("prorates by what was actually paid on a discounted sale", () => {
    // Paid ₱800 on a ₱1,000 list. Returning ₱500 of list gets ₱400 back, not
    // ₱500 — the ₱100 was never taken.
    expect(proratedRefund(50000, { subtotalCentavos: 100000, totalCentavos: 80000 })).toBe(40000);
  });

  it("prorates an SC/PWD sale, where EVERY sale is discounted", () => {
    // ₱112 shelf, SC pays ₱80 — the systematic overpayment this prevents.
    expect(proratedRefund(11200, { subtotalCentavos: 11200, totalCentavos: 8000 })).toBe(8000);
  });

  it("gives back nothing on a fully discounted sale", () => {
    expect(proratedRefund(10000, { subtotalCentavos: 10000, totalCentavos: 0 })).toBe(0);
  });

  it("never returns a negative amount, or divides by zero", () => {
    expect(proratedRefund(-500, { subtotalCentavos: 10000, totalCentavos: 10000 })).toBe(0);
    expect(proratedRefund(1000, { subtotalCentavos: 0, totalCentavos: 0 })).toBe(0);
  });

  it("rounds to a whole centavo", () => {
    // 333 * (1/3) = 111 exactly; 100 * (1/3) rounds.
    expect(proratedRefund(100, { subtotalCentavos: 300, totalCentavos: 100 })).toBe(33);
  });
});
