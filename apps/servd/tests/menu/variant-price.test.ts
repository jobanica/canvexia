import { describe, it, expect } from "vitest";
import { sizeHasNoPriceOfItsOwn, variantPrice } from "@/lib/menu/variant-price";

/**
 * The bug this exists for, end to end:
 *
 * An item is priced ₱100. Somebody adds sizes and leaves a price box blank. The
 * editor saves it as 0. A customer picks that size, the order builder snapshots
 * ₱0 onto the line, the order totals ₱0, settling it records no payment because
 * there is nothing to collect — and the sale disappears from revenue, from
 * accounting and from the shift report. It survives in exactly one place: the
 * order history, listed at ₱0.00, which is what made it look like the dashboard
 * was broken.
 */

describe("variantPrice", () => {
  it("charges the size's own price when it has one", () => {
    expect(variantPrice(15_000, 10_000)).toBe(15_000);
  });

  it("charges a size cheaper than the item, if that's what was set", () => {
    expect(variantPrice(5_000, 10_000)).toBe(5_000);
  });

  // The whole point.
  it("falls back to the item's price when the box was left blank", () => {
    expect(variantPrice(0, 10_000)).toBe(10_000);
    expect(variantPrice(null, 10_000)).toBe(10_000);
    expect(variantPrice(undefined, 10_000)).toBe(10_000);
  });

  it("treats a nonsense price as unset rather than as free", () => {
    expect(variantPrice(NaN, 10_000)).toBe(10_000);
    expect(variantPrice(-500, 10_000)).toBe(10_000);
  });

  // A giveaway is a deliberate act: you make the ITEM free.
  it("keeps a genuinely free item free", () => {
    expect(variantPrice(0, 0)).toBe(0);
    expect(variantPrice(null, 0)).toBe(0);
  });

  it("knows when a size is riding on the item's price", () => {
    expect(sizeHasNoPriceOfItsOwn(0)).toBe(true);
    expect(sizeHasNoPriceOfItsOwn(null)).toBe(true);
    expect(sizeHasNoPriceOfItsOwn(15_000)).toBe(false);
  });
});

describe("the reported order", () => {
  // Two lines, both on a blank size, is how a two-item order came to ₱0.00 and
  // showed in the history while the dashboard counted nothing.
  it("no longer totals nothing", () => {
    const item = 10_000;
    const lines = [variantPrice(0, item), variantPrice(0, item)];
    expect(lines.reduce((s, n) => s + n, 0)).toBe(20_000);
  });
});
