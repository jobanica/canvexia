import { describe, it, expect } from "vitest";
import { stockState, stockStates } from "@/lib/inventory/availability";

/**
 * The oversell guard. Getting this wrong means taking money for something
 * that isn't on the shelf, which is the one inventory failure a customer
 * actually feels.
 */

describe("stockState", () => {
  it("counts what's left after what's already promised", () => {
    expect(stockState({ onHand: 10, committed: 3 })).toEqual({
      onHand: 10,
      committed: 3,
      available: 7,
      soldOut: false,
    });
  });

  it("is sold out once every unit is spoken for, with stock still on the shelf", () => {
    const s = stockState({ onHand: 5, committed: 5 });
    expect(s.available).toBe(0);
    expect(s.soldOut).toBe(true);
    expect(s.onHand).toBe(5); // the units are still there — they're just someone else's
  });

  // Stock can legitimately go negative (a manual count, a sale recorded twice).
  // Reporting -2 available would read as a limit that lets orders through.
  it("never reports negative availability", () => {
    expect(stockState({ onHand: -2, committed: 1 }).available).toBe(0);
    expect(stockState({ onHand: 1, committed: 9 }).available).toBe(0);
  });

  it("treats an empty shelf as sold out", () => {
    expect(stockState({ onHand: 0, committed: 0 }).soldOut).toBe(true);
  });
});

describe("stockStates", () => {
  it("pools every open line for the same product", () => {
    const m = stockStates(
      [{ menuItemId: "mug", stockQty: 10 }],
      [
        { menuItemId: "mug", quantity: 2 },
        { menuItemId: "mug", quantity: 3 },
      ],
    );
    expect(m.get("mug")?.available).toBe(5);
  });

  it("leaves untracked products out, so nothing limits them", () => {
    const m = stockStates([{ menuItemId: "mug", stockQty: 1 }], []);
    expect(m.has("adobo")).toBe(false);
    expect(m.get("mug")?.available).toBe(1);
  });

  it("ignores commitments for products nobody counts", () => {
    const m = stockStates([{ menuItemId: "mug", stockQty: 4 }], [{ menuItemId: "adobo", quantity: 99 }]);
    expect(m.get("mug")?.available).toBe(4);
  });

  it("skips order lines whose product was deleted", () => {
    const m = stockStates([{ menuItemId: "mug", stockQty: 4 }], [{ menuItemId: null, quantity: 2 }]);
    expect(m.get("mug")?.available).toBe(4);
  });

  it("ignores ingredient rows, which belong to no product", () => {
    expect(stockStates([{ menuItemId: null, stockQty: 100 }], []).size).toBe(0);
  });

  // The whole point: on-hand alone still reads as full until fulfilment, so a
  // second customer would sail through the check.
  it("closes the window between an order being taken and stock coming off", () => {
    const onHandOnly = stockState({ onHand: 1, committed: 0 });
    expect(onHandOnly.soldOut).toBe(false);

    const afterSomeoneElseOrdered = stockStates(
      [{ menuItemId: "mug", stockQty: 1 }],
      [{ menuItemId: "mug", quantity: 1 }],
    );
    expect(afterSomeoneElseOrdered.get("mug")?.soldOut).toBe(true);
  });
});
