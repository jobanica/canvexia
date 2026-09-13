import { describe, it, expect } from "vitest";
import { replaceCartLine, selectionFromLine } from "@/lib/cart/edit-line";
import type { CartLine } from "@/lib/cart/types";

/**
 * "Di daw po pwede i-edit once na add to cart na."
 *
 * Quantity and remove were already there; what wasn't was changing your mind
 * about the item itself — the size, the add-ons, the note. The only route was
 * to delete the line and build it again from scratch.
 */

const line = (over: Partial<CartLine> = {}): CartLine => ({
  lineId: "L1",
  itemId: "burger",
  name: "Burger",
  basePrice: 10_000,
  unitPrice: 10_000,
  quantity: 1,
  modifiers: [],
  ...over,
});

describe("reopening a line in the picker", () => {
  it("brings back every add-on that was chosen", () => {
    const l = line({
      modifiers: [
        { modifierId: "cheese", groupId: "extras", name: "Cheese", priceDelta: 2_000 },
        { modifierId: "bacon", groupId: "extras", name: "Bacon", priceDelta: 3_000 },
      ],
    });
    expect(selectionFromLine(l)).toEqual({ extras: ["cheese", "bacon"] });
  });

  it("keeps each group's choices apart", () => {
    const l = line({
      modifiers: [
        { modifierId: "large", groupId: "size", name: "Large", priceDelta: 2_000 },
        { modifierId: "cheese", groupId: "extras", name: "Cheese", priceDelta: 2_000 },
      ],
    });
    expect(selectionFromLine(l)).toEqual({ size: ["large"], extras: ["cheese"] });
  });

  it("is empty for a line with no options", () => {
    expect(selectionFromLine(line())).toEqual({});
  });
});

describe("saving the edit", () => {
  it("changes the row that was edited", () => {
    const before = [line(), line({ lineId: "L2", itemId: "fries", name: "Fries" })];
    const after = replaceCartLine(before, line({ quantity: 3 }));
    expect(after).toHaveLength(2);
    expect(after[0].quantity).toBe(3);
  });

  // A diner who changes a size expects that row to change, not to disappear
  // from where it was and turn up at the bottom of the list.
  it("leaves it where it was", () => {
    const before = [
      line({ lineId: "L1" }),
      line({ lineId: "L2", name: "Fries" }),
      line({ lineId: "L3", name: "Coke" }),
    ];
    const after = replaceCartLine(before, line({ lineId: "L2", name: "Fries (Large)" }));
    expect(after.map((l) => l.lineId)).toEqual(["L1", "L2", "L3"]);
    expect(after[1].name).toBe("Fries (Large)");
  });

  it("doesn't leave the original sitting next to its replacement", () => {
    const after = replaceCartLine([line({ name: "Burger" })], line({ name: "Burger (Large)" }));
    expect(after).toHaveLength(1);
    expect(after[0].name).toBe("Burger (Large)");
  });

  // Merging on edit would silently double a quantity. The diner asked to change
  // one row, not to combine two.
  it("never merges the edited line into an identical one", () => {
    const before = [line({ lineId: "L1", quantity: 2 }), line({ lineId: "L2", quantity: 2 })];
    const after = replaceCartLine(before, line({ lineId: "L2", quantity: 2 }));
    expect(after).toHaveLength(2);
    expect(after.reduce((s, l) => s + l.quantity, 0)).toBe(4);
  });

  it("adds the line if it has since gone from the cart", () => {
    expect(replaceCartLine([], line())).toHaveLength(1);
  });
});
