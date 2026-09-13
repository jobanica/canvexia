import { describe, it, expect } from "vitest";
import {
  applyStockToggle,
  nextAvailability,
  stockToggleMessage,
} from "@/lib/menu/stock-toggle";
import type { DinerCategory, DinerItem } from "@/lib/cart/types";

/**
 * The cashier's sold-out switch. The case that makes this worth testing is the
 * dish that's unavailable for a reason the switch can't fix: it looks identical
 * on the tile, and getting it wrong means a tap that appears to do nothing.
 */

function item(over: Partial<DinerItem> = {}): DinerItem {
  return {
    id: "lechon",
    name: "Lechon Kawali",
    description: null,
    price: 25000,
    imageUrl: null,
    videoUrl: null,
    videoPosterUrl: null,
    isAvailable: true,
    manualOut: false,
    autoOut: false,
    dietaryTags: [],
    groups: [],
    ...over,
  };
}

const cats = (items: DinerItem[]): DinerCategory[] => [{ id: "c1", name: "Mains", items }];

describe("nextAvailability", () => {
  it("takes a selling dish off the menu", () => {
    expect(nextAvailability(item())).toBe(false);
  });

  it("puts a hand-switched-off dish back", () => {
    expect(nextAvailability(item({ isAvailable: false, manualOut: true }))).toBe(true);
  });

  it("still turns the switch OFF for a dish that ran out on its own", () => {
    // The tile reads "sold out" because stock hit zero, but the hand switch is
    // still on — so the tap has to turn it off, not uselessly turn it on again.
    const ranOut = item({ isAvailable: false, manualOut: false, autoOut: true });
    expect(nextAvailability(ranOut)).toBe(false);
  });

  it("treats a menu loaded without the reason fields as switched on", () => {
    // Older payload, no manualOut — the safe reading is "nothing has been
    // switched off", so a tap marks it sold out rather than silently no-oping.
    const bare = { isAvailable: true };
    expect(nextAvailability(bare)).toBe(false);
  });
});

describe("stockToggleMessage", () => {
  it("confirms a dish going off the menu", () => {
    expect(stockToggleMessage("Lechon", item(), false)).toContain("sold out");
  });

  it("confirms a dish coming back", () => {
    expect(stockToggleMessage("Lechon", item({ manualOut: true }), true)).toBe(
      "Lechon is back on the menu.",
    );
  });

  it("explains why a dish that ran out is STILL sold out after being switched on", () => {
    const msg = stockToggleMessage("Lechon", item({ autoOut: true, manualOut: true }), true);
    expect(msg).toContain("still sold out");
    expect(msg).toContain("Restock");
  });
});

describe("applyStockToggle", () => {
  it("marks the tapped item sold out and leaves the rest alone", () => {
    const other = item({ id: "adobo", name: "Adobo" });
    const next = applyStockToggle(cats([item(), other]), "lechon", false);
    expect(next![0].items[0]).toMatchObject({ isAvailable: false, manualOut: true });
    expect(next![0].items[1]).toMatchObject({ isAvailable: true, manualOut: false });
  });

  it("puts an item back on the menu", () => {
    const off = item({ isAvailable: false, manualOut: true });
    const next = applyStockToggle(cats([off]), "lechon", true);
    expect(next![0].items[0]).toMatchObject({ isAvailable: true, manualOut: false });
  });

  it("does NOT show a run-out dish as sellable just because the switch moved", () => {
    const ranOut = item({ isAvailable: false, manualOut: true, autoOut: true });
    const next = applyStockToggle(cats([ranOut]), "lechon", true);
    // Switch back on, still not sellable — same answer the menu loader gives.
    expect(next![0].items[0].manualOut).toBe(false);
    expect(next![0].items[0].isAvailable).toBe(false);
  });

  it("leaves the menu untouched when nothing matches, and survives a null menu", () => {
    const before = cats([item()]);
    expect(applyStockToggle(before, "nope", false)).toEqual(before);
    expect(applyStockToggle(null, "lechon", false)).toBeNull();
  });

  it("does not mutate the menu it was given", () => {
    const before = cats([item()]);
    applyStockToggle(before, "lechon", false);
    expect(before[0].items[0].isAvailable).toBe(true);
  });
});
