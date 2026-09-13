import { describe, it, expect } from "vitest";
import { summariseShift, methodLabel, type ShiftTransaction } from "@/lib/orders/shift-breakdown";
import {
  SHIFT_RETENTION_HOURS,
  isShiftRetained,
  shiftRetentionCutoff,
} from "@/lib/orders/shift-retention";

const txn = (over: Partial<ShiftTransaction> = {}): ShiftTransaction => ({
  orderId: "o1",
  label: "#1",
  at: "Aug 12, 7:20 PM",
  orderType: "dine_in",
  method: "cash",
  amount: 10000,
  counter: true,
  ...over,
});

describe("summariseShift", () => {
  it("counts everything that happened, counter and online", () => {
    const b = summariseShift([
      txn({ amount: 10000 }),
      txn({ amount: 25000, counter: false, method: "online_gcash" }),
    ]);
    expect(b.total).toBe(35000);
    expect(b.count).toBe(2);
  });

  // The one thing that must not go wrong: an online sale folded into the
  // drawer figure leaves the cashier short by exactly that amount, every night.
  it("keeps drawer money and online money apart", () => {
    const b = summariseShift([
      txn({ amount: 10000, counter: true }),
      txn({ amount: 25000, counter: false, method: "online_card" }),
    ]);
    expect(b.counterTotal).toBe(10000);
    expect(b.counterCount).toBe(1);
    expect(b.onlineTotal).toBe(25000);
    expect(b.onlineCount).toBe(1);
    expect(b.counterTotal + b.onlineTotal).toBe(b.total);
  });

  it("groups by how the food went out", () => {
    const b = summariseShift([
      txn({ orderType: "dine_in", amount: 10000 }),
      txn({ orderType: "dine_in", amount: 5000 }),
      txn({ orderType: "delivery", amount: 30000 }),
      txn({ orderType: "takeout", amount: 2000 }),
    ]);
    expect(b.byOrderType.map((g) => [g.key, g.amount, g.count])).toEqual([
      ["delivery", 30000, 1],
      ["dine_in", 15000, 2],
      ["takeout", 2000, 1],
    ]);
  });

  it("names the order types rather than showing raw keys", () => {
    const b = summariseShift([txn({ orderType: "third_party" })]);
    expect(b.byOrderType[0].label).not.toBe("third_party");
    expect(b.byOrderType[0].label.length).toBeGreaterThan(0);
  });

  it("groups by payment method, biggest first", () => {
    const b = summariseShift([
      txn({ method: "cash", amount: 5000 }),
      txn({ method: "gcash", amount: 40000 }),
      txn({ method: "cash", amount: 3000 }),
    ]);
    expect(b.byMethod[0]).toMatchObject({ key: "gcash", amount: 40000, count: 1 });
    expect(b.byMethod[1]).toMatchObject({ key: "cash", amount: 8000, count: 2 });
  });

  it("holds up on a shift where nothing happened", () => {
    const b = summariseShift([]);
    expect(b).toMatchObject({ total: 0, count: 0, counterTotal: 0, onlineTotal: 0 });
    expect(b.byOrderType).toEqual([]);
    expect(b.byMethod).toEqual([]);
  });

  // Two tickets of the same value must not collapse into one another.
  it("orders equal-value groups deterministically", () => {
    const a = summariseShift([txn({ method: "maya", amount: 100 }), txn({ method: "cash", amount: 100 })]);
    const b = summariseShift([txn({ method: "cash", amount: 100 }), txn({ method: "maya", amount: 100 })]);
    expect(a.byMethod.map((g) => g.key)).toEqual(b.byMethod.map((g) => g.key));
  });

  it("falls back to the raw method when there's no friendly name", () => {
    expect(methodLabel("cash")).toBe("Cash");
    expect(methodLabel("something_new")).toBe("something_new");
  });
});

describe("shift retention", () => {
  const now = new Date("2026-08-14T02:00:00Z");
  const hours = (n: number) => new Date(now.getTime() - n * 60 * 60 * 1000);

  it("keeps a shift for the full window", () => {
    expect(isShiftRetained(hours(1), now)).toBe(true);
    expect(isShiftRetained(hours(SHIFT_RETENTION_HOURS - 1), now)).toBe(true);
  });

  it("lets go once it's past", () => {
    expect(isShiftRetained(hours(SHIFT_RETENTION_HOURS + 1), now)).toBe(false);
  });

  it("agrees with the cutoff it purges by", () => {
    const cutoff = shiftRetentionCutoff(now);
    for (const h of [0, 12, 47, 48, 49, 100]) {
      expect(hours(h) >= cutoff).toBe(isShiftRetained(hours(h), now));
    }
  });

  it("is the 48 hours that was asked for", () => {
    expect(SHIFT_RETENTION_HOURS).toBe(48);
  });
});
