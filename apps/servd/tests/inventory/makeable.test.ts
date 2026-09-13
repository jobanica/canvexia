import { describe, it, expect } from "vitest";
import {
  availabilityFor,
  committedByItem,
  dishStock,
  makeableServings,
  LOW_STOCK_SERVINGS,
  type Availability,
} from "@/lib/inventory/makeable";
import type { StockLink } from "@/lib/inventory/deductions";

/**
 * The scenario this was built for, in the owner's words: three portions in the
 * fridge, a cashier accepts ten orders, because stock only came off when the
 * kitchen finished cooking. Nothing stopped them and nothing warned them.
 */

const link = (menuItemId: string, inventoryItemId: string, quantity: number): StockLink => ({
  menuItemId,
  inventoryItemId,
  quantity,
});

const avail = (pairs: [string, number][]): Map<string, Availability> =>
  new Map(pairs.map(([id, available]) => [id, { onHand: available, committed: 0, available }]));

describe("committed stock", () => {
  it("counts what open orders have already promised", () => {
    const c = committedByItem(
      [{ menuItemId: "adobo", quantity: 2 }],
      [link("adobo", "pork", 0.25)],
    );
    expect(c.get("pork")).toBe(0.5);
  });

  // The whole point: on-hand alone still reads full until the kitchen cooks.
  it("leaves available below on-hand while orders are in the kitchen", () => {
    const committed = committedByItem(
      [{ menuItemId: "adobo", quantity: 1 }],
      [link("adobo", "pork", 1)],
    );
    const a = availabilityFor(new Map([["pork", 3]]), committed);
    expect(a.get("pork")).toEqual({ onHand: 3, committed: 1, available: 2 });
  });
});

describe("makeableServings", () => {
  it("is limited by the scarcest ingredient", () => {
    const links = [link("burger", "bun", 1), link("burger", "patty", 1)];
    expect(makeableServings(links, avail([["bun", 200], ["patty", 1]]))).toBe(1);
  });

  it("divides by how much each serving uses", () => {
    expect(makeableServings([link("adobo", "pork", 0.25)], avail([["pork", 3]]))).toBe(12);
  });

  it("rounds down — you can't sell most of a portion", () => {
    expect(makeableServings([link("adobo", "pork", 0.4)], avail([["pork", 1]]))).toBe(2);
  });

  // Backwards here would take a whole menu off sale the moment it shipped.
  it("returns null for a dish nothing is tracked for", () => {
    expect(makeableServings([], avail([["pork", 3]]))).toBeNull();
  });

  it("ignores an ingredient that isn't stock-counted", () => {
    const links = [link("adobo", "pork", 1), link("adobo", "salt", 0.01)];
    expect(makeableServings(links, avail([["pork", 4]]))).toBe(4);
  });

  it("reports none left rather than a debt when already oversold", () => {
    const a = new Map([["pork", { onHand: 1, committed: 5, available: -4 }]]);
    expect(makeableServings([link("adobo", "pork", 1)], a)).toBe(0);
  });
});

describe("dishStock", () => {
  const name = (id: string) => ({ pork: "Pork belly", bun: "Burger bun" })[id] ?? id;

  it("is sold out when nothing is left", () => {
    const s = dishStock([link("adobo", "pork", 1)], avail([["pork", 0]]), name);
    expect(s).toMatchObject({ makeable: 0, soldOut: true, low: false });
  });

  it("warns while there's still a little left", () => {
    const s = dishStock([link("adobo", "pork", 1)], avail([["pork", 2]]), name);
    expect(s).toMatchObject({ makeable: 2, soldOut: false, low: true });
  });

  it("stops warning once there's plenty", () => {
    const s = dishStock([link("adobo", "pork", 1)], avail([["pork", 50]]), name);
    expect(s.low).toBe(false);
  });

  it("warns at the threshold and not one above it", () => {
    const at = dishStock([link("d", "x", 1)], avail([["x", LOW_STOCK_SERVINGS]]), name);
    const over = dishStock([link("d", "x", 1)], avail([["x", LOW_STOCK_SERVINGS + 1]]), name);
    expect(at.low).toBe(true);
    expect(over.low).toBe(false);
  });

  // "Pork belly is nearly out" is actionable. "This dish is nearly out" is not.
  it("names the ingredient that actually runs out first", () => {
    const links = [link("burger", "bun", 1), link("burger", "pork", 1)];
    const s = dishStock(links, avail([["bun", 100], ["pork", 2]]), name);
    expect(s.limitingIngredient).toBe("Pork belly");
  });

  it("says nothing at all about an untracked dish", () => {
    const s = dishStock([], avail([["pork", 0]]), name);
    expect(s).toEqual({ makeable: null, soldOut: false, low: false, limitingIngredient: null });
  });
});

describe("the reported scenario", () => {
  it("three in the fridge, one ordered → two left, not three", () => {
    const links = [link("adobo", "pork", 1)];
    const committed = committedByItem([{ menuItemId: "adobo", quantity: 1 }], links);
    const a = availabilityFor(new Map([["pork", 3]]), committed);
    expect(dishStock(links, a, () => "Pork").makeable).toBe(2);
  });

  it("three in the fridge, three ordered → sold out before a tenth can be taken", () => {
    const links = [link("adobo", "pork", 1)];
    const committed = committedByItem([{ menuItemId: "adobo", quantity: 3 }], links);
    const a = availabilityFor(new Map([["pork", 3]]), committed);
    const s = dishStock(links, a, () => "Pork");
    expect(s.makeable).toBe(0);
    expect(s.soldOut).toBe(true);
  });
});
