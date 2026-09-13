import { describe, it, expect } from "vitest";
import { rollUpItemsSold, type SoldLineInput } from "@/lib/orders/items-sold";

/**
 * "How many burgers did we sell today." The report exists to answer exactly
 * that, so the tests are written as that question.
 */

const line = (over: Partial<SoldLineInput> = {}): SoldLineInput => ({
  menuItemId: "burger",
  nameAtTime: "Burger",
  quantity: 1,
  unitPrice: 15000,
  modifierDeltas: [],
  ...over,
});

describe("rollUpItemsSold", () => {
  it("adds up one item across many tickets", () => {
    const r = rollUpItemsSold([line({ quantity: 2 }), line({ quantity: 1 }), line({ quantity: 3 })]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ name: "Burger", quantity: 6, revenue: 90000 });
  });

  // The whole reason it groups on the id: "Burger (Large)" and "Burger
  // (Regular)" are one product, and answering per-size is answering a
  // different question from the one that was asked.
  it("folds sizes of the same product into one row", () => {
    const r = rollUpItemsSold([
      line({ nameAtTime: "Burger (Large)", quantity: 3, unitPrice: 18000 }),
      line({ nameAtTime: "Burger (Regular)", quantity: 5, unitPrice: 15000 }),
    ]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].quantity).toBe(8);
    expect(r.items[0].name).toBe("Burger");
    expect(r.items[0].revenue).toBe(3 * 18000 + 5 * 15000);
  });

  it("leaves a single-size item's name exactly as it was rung up", () => {
    const r = rollUpItemsSold([line({ nameAtTime: "Sisig (Sizzling)", quantity: 2 })]);
    expect(r.items[0].name).toBe("Sisig (Sizzling)");
  });

  it("counts add-ons in the revenue", () => {
    const r = rollUpItemsSold([line({ quantity: 2, modifierDeltas: [2000, 1000] })]);
    expect(r.items[0].revenue).toBe((15000 + 3000) * 2);
  });

  it("keeps different products apart", () => {
    const r = rollUpItemsSold([
      line({ menuItemId: "burger", nameAtTime: "Burger", quantity: 4 }),
      line({ menuItemId: "fries", nameAtTime: "Fries", quantity: 9, unitPrice: 6000 }),
    ]);
    expect(r.items.map((i) => [i.name, i.quantity])).toEqual([
      ["Fries", 9],
      ["Burger", 4],
    ]);
  });

  // Order history keeps a deleted item's name on the line, and last month's
  // sales of a discontinued dish are still sales.
  it("still reports an item that's been removed from the menu", () => {
    const r = rollUpItemsSold([line({ menuItemId: null, nameAtTime: "Retired Special", quantity: 7 })]);
    expect(r.items[0]).toMatchObject({ name: "Retired Special", quantity: 7, deleted: true });
  });

  it("doesn't merge two deleted items that shared no name", () => {
    const r = rollUpItemsSold([
      line({ menuItemId: null, nameAtTime: "Old A", quantity: 1 }),
      line({ menuItemId: null, nameAtTime: "Old B", quantity: 1 }),
    ]);
    expect(r.items).toHaveLength(2);
  });

  it("puts the best seller first", () => {
    const r = rollUpItemsSold([
      line({ menuItemId: "a", nameAtTime: "A", quantity: 1 }),
      line({ menuItemId: "b", nameAtTime: "B", quantity: 50 }),
      line({ menuItemId: "c", nameAtTime: "C", quantity: 10 }),
    ]);
    expect(r.items.map((i) => i.name)).toEqual(["B", "C", "A"]);
  });

  // A report that reshuffles between loads is one nobody trusts.
  it("orders ties the same way every time", () => {
    const a = rollUpItemsSold([
      line({ menuItemId: "z", nameAtTime: "Zeta", quantity: 3 }),
      line({ menuItemId: "a", nameAtTime: "Alpha", quantity: 3 }),
    ]);
    const b = rollUpItemsSold([
      line({ menuItemId: "a", nameAtTime: "Alpha", quantity: 3 }),
      line({ menuItemId: "z", nameAtTime: "Zeta", quantity: 3 }),
    ]);
    expect(a.items.map((i) => i.name)).toEqual(b.items.map((i) => i.name));
  });

  it("totals across everything sold", () => {
    const r = rollUpItemsSold([
      line({ menuItemId: "a", nameAtTime: "A", quantity: 2, unitPrice: 10000 }),
      line({ menuItemId: "b", nameAtTime: "B", quantity: 3, unitPrice: 5000 }),
    ]);
    expect(r.totalQuantity).toBe(5);
    expect(r.totalRevenue).toBe(35000);
    expect(r.distinctItems).toBe(2);
  });

  it("ignores zero and negative quantities rather than subtracting", () => {
    const r = rollUpItemsSold([line({ quantity: 0 }), line({ quantity: -4 }), line({ quantity: 2 })]);
    expect(r.items[0].quantity).toBe(2);
  });

  it("holds up on a day with no sales", () => {
    expect(rollUpItemsSold([])).toEqual({
      items: [],
      totalQuantity: 0,
      totalRevenue: 0,
      distinctItems: 0,
    });
  });
});
