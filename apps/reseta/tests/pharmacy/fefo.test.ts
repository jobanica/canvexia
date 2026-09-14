import { describe, it, expect } from "vitest";
import {
  allocateFefo,
  dispensableBatches,
  expiringWithin,
  onHand,
  type AllocatableBatch,
} from "@/lib/pharmacy/fefo";

const TODAY = new Date("2026-09-14T09:00:00+08:00");

function batch(over: Partial<AllocatableBatch> & { id: string }): AllocatableBatch {
  return {
    expiryDate: null,
    receivedAt: new Date("2026-01-01"),
    quantity: 10,
    costCentavos: 500,
    lotNumber: null,
    ...over,
  };
}

describe("FEFO dispensing", () => {
  it("takes the soonest expiry first, not the oldest delivery", () => {
    // The distinction FIFO gets wrong: the OLDER delivery expires LATER here.
    const batches = [
      batch({
        id: "old-delivery",
        receivedAt: new Date("2025-01-01"),
        expiryDate: new Date("2027-12-31"),
      }),
      batch({
        id: "new-delivery",
        receivedAt: new Date("2026-09-01"),
        expiryDate: new Date("2026-10-31"),
      }),
    ];
    const result = allocateFefo(batches, 5, TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0].batchId).toBe("new-delivery");
  });

  it("spans batches when one is not enough, still soonest-first", () => {
    const batches = [
      batch({ id: "later", quantity: 10, expiryDate: new Date("2027-01-31") }),
      batch({ id: "sooner", quantity: 4, expiryDate: new Date("2026-10-31") }),
    ];
    const result = allocateFefo(batches, 7, TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.allocations).toEqual([
      expect.objectContaining({ batchId: "sooner", quantity: 4 }),
      expect.objectContaining({ batchId: "later", quantity: 3 }),
    ]);
  });

  it("refuses to dispense expired stock even when nothing else is left", () => {
    const batches = [
      batch({ id: "expired", quantity: 100, expiryDate: new Date("2026-08-31") }),
    ];
    const result = allocateFefo(batches, 1, TODAY);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("insufficient_stock");
    // Expired units are not "available" — reporting them as such is how they
    // end up dispensed.
    expect(result.available).toBe(0);
  });

  it("still dispenses a batch that expires TODAY", () => {
    // An expiry is a date, not an instant: a box marked today is good today.
    const batches = [
      batch({ id: "today", quantity: 3, expiryDate: new Date("2026-09-14T00:00:00+08:00") }),
    ];
    const result = allocateFefo(batches, 3, TODAY);
    expect(result.ok).toBe(true);
  });

  it("holds undated stock back until dated stock is gone", () => {
    const batches = [
      batch({ id: "undated", quantity: 10, expiryDate: null }),
      batch({ id: "dated", quantity: 2, expiryDate: new Date("2027-06-30") }),
    ];
    const result = allocateFefo(batches, 5, TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.allocations[0].batchId).toBe("dated");
    expect(result.allocations[1].batchId).toBe("undated");
  });

  it("breaks equal expiries by received date", () => {
    const same = new Date("2027-03-31");
    const batches = [
      batch({ id: "newer", quantity: 5, expiryDate: same, receivedAt: new Date("2026-06-01") }),
      batch({ id: "older", quantity: 5, expiryDate: same, receivedAt: new Date("2026-01-01") }),
    ];
    const result = allocateFefo(batches, 6, TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.allocations[0].batchId).toBe("older");
  });

  it("fails whole rather than partially when short", () => {
    const batches = [batch({ id: "a", quantity: 2, expiryDate: new Date("2027-01-01") })];
    const result = allocateFefo(batches, 5, TODAY);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result).toEqual({ ok: false, reason: "insufficient_stock", available: 2, needed: 5 });
  });

  it("carries the batch's own cost, so margin survives a price change", () => {
    const batches = [
      batch({ id: "cheap", quantity: 2, costCentavos: 300, expiryDate: new Date("2026-11-30") }),
      batch({ id: "dear", quantity: 2, costCentavos: 900, expiryDate: new Date("2027-11-30") }),
    ];
    const result = allocateFefo(batches, 3, TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.allocations.map((a) => a.costCentavos)).toEqual([300, 900]);
  });

  it("allocates nothing for a zero quantity", () => {
    expect(allocateFefo([batch({ id: "a" })], 0, TODAY)).toEqual({
      ok: true,
      allocations: [],
    });
  });

  it("skips empty batches", () => {
    const batches = [
      batch({ id: "empty", quantity: 0, expiryDate: new Date("2026-10-01") }),
      batch({ id: "stocked", quantity: 5, expiryDate: new Date("2027-10-01") }),
    ];
    expect(dispensableBatches(batches, TODAY).map((b) => b.id)).toEqual(["stocked"]);
  });
});

describe("on-hand", () => {
  it("excludes expired stock — it is not sellable, so it is not stock", () => {
    const batches = [
      batch({ id: "good", quantity: 6, expiryDate: new Date("2027-01-01") }),
      batch({ id: "expired", quantity: 40, expiryDate: new Date("2026-01-01") }),
    ];
    expect(onHand(batches, TODAY)).toBe(6);
  });
});

describe("expiry alerting", () => {
  it("lists what expires within the window, soonest first", () => {
    const batches = [
      batch({ id: "far", quantity: 1, expiryDate: new Date("2027-01-01") }),
      batch({ id: "soon", quantity: 1, expiryDate: new Date("2026-10-01") }),
      batch({ id: "sooner", quantity: 1, expiryDate: new Date("2026-09-20") }),
    ];
    expect(expiringWithin(batches, 30, TODAY).map((b) => b.id)).toEqual(["sooner", "soon"]);
  });

  it("includes already-expired batches — they are the most urgent, not the least", () => {
    const batches = [
      batch({ id: "expired", quantity: 3, expiryDate: new Date("2026-08-01") }),
      batch({ id: "soon", quantity: 1, expiryDate: new Date("2026-09-20") }),
    ];
    expect(expiringWithin(batches, 30, TODAY).map((b) => b.id)).toEqual(["expired", "soon"]);
  });

  it("ignores undated and empty batches", () => {
    const batches = [
      batch({ id: "undated", quantity: 5, expiryDate: null }),
      batch({ id: "empty", quantity: 0, expiryDate: new Date("2026-09-15") }),
    ];
    expect(expiringWithin(batches, 30, TODAY)).toEqual([]);
  });
});
