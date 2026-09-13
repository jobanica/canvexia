import { describe, it, expect } from "vitest";
import { rollupShiftPayments, expectedCash } from "@/lib/orders/shift-rollup";

/**
 * The figures a cashier counts their drawer against at the end of a turn.
 */

const p = (amount: number, method: string, orderId: string) => ({ amount, method, orderId });

describe("rollupShiftPayments", () => {
  it("totals the takings and splits them by method", () => {
    const r = rollupShiftPayments([
      p(30000, "cash", "o1"),
      p(15000, "gcash", "o2"),
      p(20000, "cash", "o3"),
    ]);
    expect(r.gross).toBe(65000);
    expect(r.byMethod).toEqual([
      { method: "cash", amount: 50000, count: 2 },
      { method: "gcash", amount: 15000, count: 1 },
    ]);
  });

  // A bill split across three tenders is ONE order. Counting it three times
  // would make a quiet shift look busy and skew the average order value the
  // owner reads off this.
  it("counts a split bill as one order, not three", () => {
    const r = rollupShiftPayments([
      p(10000, "cash", "o1"),
      p(10000, "gcash", "o1"),
      p(5000, "card_terminal", "o1"),
    ]);
    expect(r.orderCount).toBe(1);
    expect(r.gross).toBe(25000);
  });

  // …but the per-method COUNT is tenders, which is what reconciling a drawer
  // actually needs: three cash payments is three times it was opened.
  it("counts tenders per method, not orders", () => {
    const r = rollupShiftPayments([p(100, "cash", "o1"), p(100, "cash", "o1")]);
    expect(r.byMethod[0]).toEqual({ method: "cash", amount: 200, count: 2 });
    expect(r.orderCount).toBe(1);
  });

  it("puts the biggest method at the top of the paper", () => {
    const r = rollupShiftPayments([
      p(100, "gcash", "o1"),
      p(900, "cash", "o2"),
      p(500, "card_terminal", "o3"),
    ]);
    expect(r.byMethod.map((m) => m.method)).toEqual(["cash", "card_terminal", "gcash"]);
  });

  it("hands back every order it saw, once each", () => {
    const r = rollupShiftPayments([p(1, "cash", "o1"), p(1, "cash", "o2"), p(1, "cash", "o1")]);
    expect([...r.orderIds].sort()).toEqual(["o1", "o2"]);
  });

  it("is zero for a shift that took nothing", () => {
    const r = rollupShiftPayments([]);
    expect(r).toEqual({ gross: 0, orderCount: 0, orderIds: [], byMethod: [] });
  });
});

describe("expectedCash", () => {
  it("is what was taken less what was removed", () => {
    expect(expectedCash(300000, 100000)).toBe(200000);
  });

  it("is zero when nothing was taken", () => {
    expect(expectedCash(0, 0)).toBe(0);
  });

  // A negative figure means the data is wrong somewhere. Printing one on a
  // report a cashier signs invites them to hand over money they never had.
  it("never prints a negative drawer", () => {
    expect(expectedCash(50000, 90000)).toBe(0);
  });
});
