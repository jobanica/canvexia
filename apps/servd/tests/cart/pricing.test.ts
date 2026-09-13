import { describe, it, expect } from "vitest";
import {
  unitPrice,
  validateSelection,
  selectionToLineModifiers,
  cartTotal,
  cartCount,
} from "@/lib/cart/pricing";
import type { CartLine, DinerItem } from "@/lib/cart/types";

const item: DinerItem = {
  id: "i1",
  name: "Burger",
  description: null,
  price: 20000, // ₱200
  imageUrl: null,
  videoUrl: null,
  videoPosterUrl: null,
  isAvailable: true,
  dietaryTags: [],
  groups: [
    {
      id: "size",
      name: "Size",
      required: true,
      minSelect: 1,
      maxSelect: 1, // single-select, required
      modifiers: [
        { id: "reg", name: "Regular", priceDelta: 0 },
        { id: "large", name: "Large", priceDelta: 3000 },
      ],
    },
    {
      id: "addons",
      name: "Add-ons",
      required: false,
      minSelect: 0,
      maxSelect: 2, // optional, up to 2
      modifiers: [
        { id: "cheese", name: "Extra cheese", priceDelta: 2000 },
        { id: "bacon", name: "Bacon", priceDelta: 4000 },
        { id: "egg", name: "Egg", priceDelta: 1500 },
      ],
    },
  ],
};

describe("unitPrice", () => {
  it("adds selected modifier deltas to the base price", () => {
    expect(unitPrice(item, { size: ["large"], addons: ["cheese"] })).toBe(
      20000 + 3000 + 2000,
    );
  });
  it("is just the base price with no add-ons", () => {
    expect(unitPrice(item, { size: ["reg"] })).toBe(20000);
  });
});

describe("validateSelection", () => {
  it("requires a choice for a required group", () => {
    expect(validateSelection(item, {})).toMatch(/Size/);
  });
  it("passes when the required group is satisfied", () => {
    expect(validateSelection(item, { size: ["reg"] })).toBeNull();
  });
  it("rejects exceeding maxSelect", () => {
    const err = validateSelection(item, {
      size: ["reg"],
      addons: ["cheese", "bacon", "egg"],
    });
    expect(err).toMatch(/at most 2/);
  });
  // Switching a group from Required to Optional used to leave minSelect at 1,
  // so the diner was still forced to pick. Optional must mean skippable.
  it("lets an optional group be skipped even with a leftover minSelect", () => {
    const legacy: DinerItem = {
      ...item,
      groups: [{ ...item.groups[1], required: false, minSelect: 1 }],
    };
    expect(validateSelection(legacy, {})).toBeNull();
  });
});

describe("selectionToLineModifiers", () => {
  it("flattens the selection into snapshots", () => {
    const mods = selectionToLineModifiers(item, {
      size: ["large"],
      addons: ["bacon"],
    });
    expect(mods).toHaveLength(2);
    expect(mods.map((m) => m.name)).toContain("Large");
  });
});

describe("cart totals", () => {
  const lines: CartLine[] = [
    { lineId: "a", itemId: "i1", name: "Burger", basePrice: 20000, unitPrice: 23000, quantity: 2, modifiers: [] },
    { lineId: "b", itemId: "i2", name: "Fries", basePrice: 8000, unitPrice: 8000, quantity: 1, modifiers: [] },
  ];
  it("sums unitPrice * quantity", () => {
    expect(cartTotal(lines)).toBe(23000 * 2 + 8000);
  });
  it("counts total quantity", () => {
    expect(cartCount(lines)).toBe(3);
  });
});
