import { describe, it, expect } from "vitest";
import {
  planDeductions,
  productStockLinks,
  productsToDisable,
  type StockLink,
} from "@/lib/inventory/deductions";

/**
 * Getting this wrong oversells: the shop's page keeps saying "in stock" for
 * something that left the shelf hours ago, and someone pays for a thing that
 * isn't there. So the arithmetic is tested on its own, away from the database.
 */

const recipe = (menuItemId: string, inventoryItemId: string, quantity: number): StockLink => ({
  menuItemId,
  inventoryItemId,
  quantity,
});

describe("productStockLinks", () => {
  it("turns a product's own stock row into a one-per-sale link", () => {
    expect(productStockLinks([{ id: "inv-1", menuItemId: "prod-1" }])).toEqual([
      { menuItemId: "prod-1", inventoryItemId: "inv-1", quantity: 1 },
    ]);
  });

  it("ignores ingredient rows, which belong to no single product", () => {
    expect(productStockLinks([{ id: "inv-flour", menuItemId: null }])).toEqual([]);
  });
});

describe("planDeductions", () => {
  it("takes one unit off the shelf per unit sold", () => {
    const links = productStockLinks([{ id: "inv-mug", menuItemId: "mug" }]);
    expect(planDeductions([{ menuItemId: "mug", quantity: 3 }], links)).toEqual([
      { inventoryItemId: "inv-mug", quantity: 3 },
    ]);
  });

  it("scales a recipe by how many were sold", () => {
    const out = planDeductions([{ menuItemId: "adobo", quantity: 4 }], [recipe("adobo", "pork", 0.25)]);
    expect(out).toEqual([{ inventoryItemId: "pork", quantity: 1 }]);
  });

  // The bug this guards: applying lines one at a time is a read-modify-write
  // per line, and the last write wins — so a cart with the same product added
  // twice would deduct one of them.
  it("sums repeated lines of the same product instead of letting one win", () => {
    const links = productStockLinks([{ id: "inv-mug", menuItemId: "mug" }]);
    const out = planDeductions(
      [
        { menuItemId: "mug", quantity: 2 },
        { menuItemId: "mug", quantity: 5 },
      ],
      links,
    );
    expect(out).toEqual([{ inventoryItemId: "inv-mug", quantity: 7 }]);
  });

  it("pools an ingredient shared by two different dishes", () => {
    const out = planDeductions(
      [
        { menuItemId: "adobo", quantity: 2 },
        { menuItemId: "sinigang", quantity: 1 },
      ],
      [recipe("adobo", "onion", 1), recipe("sinigang", "onion", 2)],
    );
    expect(out).toEqual([{ inventoryItemId: "onion", quantity: 4 }]);
  });

  // A café selling both cooked food and packaged beans on one ticket.
  it("handles a product and a recipe on the same order", () => {
    const links = [
      ...productStockLinks([{ id: "inv-beans", menuItemId: "beans-1kg" }]),
      recipe("latte", "milk", 0.2),
    ];
    const out = planDeductions(
      [
        { menuItemId: "beans-1kg", quantity: 1 },
        { menuItemId: "latte", quantity: 2 },
      ],
      links,
    );
    expect(out).toEqual([
      { inventoryItemId: "inv-beans", quantity: 1 },
      { inventoryItemId: "milk", quantity: 0.4 },
    ]);
  });

  it("deducts nothing for items nobody tracks stock for", () => {
    expect(planDeductions([{ menuItemId: "untracked", quantity: 9 }], [])).toEqual([]);
  });

  it("skips deleted menu items, which order history keeps as null", () => {
    const links = productStockLinks([{ id: "inv-mug", menuItemId: "mug" }]);
    expect(planDeductions([{ menuItemId: null, quantity: 2 }], links)).toEqual([]);
  });

  it("ignores non-positive quantities rather than adding stock back", () => {
    const links = productStockLinks([{ id: "inv-mug", menuItemId: "mug" }]);
    expect(planDeductions([{ menuItemId: "mug", quantity: 0 }], links)).toEqual([]);
    expect(planDeductions([{ menuItemId: "mug", quantity: -3 }], links)).toEqual([]);
  });

  // Stable write order = stable lock order. Two tills closing overlapping
  // orders at the same instant queue up instead of deadlocking on each other.
  it("returns deductions in a deterministic order", () => {
    const links = [recipe("d", "zzz", 1), recipe("d", "aaa", 1), recipe("d", "mmm", 1)];
    const ids = planDeductions([{ menuItemId: "d", quantity: 1 }], links).map((d) => d.inventoryItemId);
    expect(ids).toEqual(["aaa", "mmm", "zzz"]);
  });
});

describe("productsToDisable", () => {
  it("pulls a product from sale when its own stock runs out", () => {
    const links = productStockLinks([{ id: "inv-mug", menuItemId: "mug" }]);
    expect(productsToDisable(["inv-mug"], links)).toEqual(["mug"]);
  });

  it("pulls every dish that needs a depleted ingredient", () => {
    const links = [recipe("adobo", "pork", 1), recipe("sisig", "pork", 1), recipe("halo", "ice", 1)];
    expect(productsToDisable(["pork"], links).sort()).toEqual(["adobo", "sisig"]);
  });

  it("leaves everything sellable when nothing ran out", () => {
    expect(productsToDisable([], [recipe("adobo", "pork", 1)])).toEqual([]);
  });

  it("names each product once even when several of its inputs ran out", () => {
    const links = [recipe("adobo", "pork", 1), recipe("adobo", "soy", 1)];
    expect(productsToDisable(["pork", "soy"], links)).toEqual(["adobo"]);
  });
});
