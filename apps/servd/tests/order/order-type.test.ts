import { describe, it, expect } from "vitest";
import {
  ORDER_TYPES,
  ORDER_TYPE_LABEL,
  ORDER_TYPE_HINT,
  ORDER_TYPE_EMOJI,
  isOrderType,
  orderTypeLabel,
  orderTypeLabelWithEmoji,
  isOffPremise,
  needsAddress,
} from "@/lib/orders/order-type";

/**
 * The same order used to read "Takeout" where it was punched, "Pickup" on the
 * cashier board and "Takeaway" on the kitchen display. These tests exist so
 * that can't come back.
 */

describe("the type list", () => {
  it("covers every way food leaves the kitchen", () => {
    expect([...ORDER_TYPES]).toEqual([
      "dine_in",
      "takeout",
      "pickup",
      "delivery",
      "third_party",
    ]);
  });

  it("gives every type a label, a hint and a glyph", () => {
    for (const t of ORDER_TYPES) {
      expect(ORDER_TYPE_LABEL[t], t).toBeTruthy();
      expect(ORDER_TYPE_HINT[t], t).toBeTruthy();
      expect(ORDER_TYPE_EMOJI[t], t).toBeTruthy();
    }
  });

  // Two types sharing a word is the bug this module was written to end.
  it("uses a distinct word for each type", () => {
    const labels = ORDER_TYPES.map((t) => ORDER_TYPE_LABEL[t]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  // Takeout and pickup are different jobs for the kitchen: one is waiting at
  // the counter, the other is a bag assembled before someone arrives.
  it("keeps takeout and pickup separate", () => {
    expect(ORDER_TYPE_LABEL.takeout).toBe("Takeout");
    expect(ORDER_TYPE_LABEL.pickup).toBe("Pickup");
  });
});

describe("orderTypeLabel", () => {
  it("names each type the same way everywhere", () => {
    expect(orderTypeLabel("dine_in")).toBe("Dine-in");
    expect(orderTypeLabel("takeout")).toBe("Takeout");
    expect(orderTypeLabel("pickup")).toBe("Pickup");
    expect(orderTypeLabel("delivery")).toBe("Delivery");
    expect(orderTypeLabel("third_party")).toBe("Third-party");
  });

  // A row written before the new types existed, or a value from a lagging
  // database, must render as something rather than blank on a kitchen card.
  it("falls back to Dine-in for anything unrecognised", () => {
    expect(orderTypeLabel(null)).toBe("Dine-in");
    expect(orderTypeLabel(undefined)).toBe("Dine-in");
    expect(orderTypeLabel("takeaway")).toBe("Dine-in");
    expect(orderTypeLabel(42)).toBe("Dine-in");
  });

  it("prefixes the glyph when asked", () => {
    expect(orderTypeLabelWithEmoji("takeout")).toBe("🥡 Takeout");
    expect(orderTypeLabelWithEmoji("third_party")).toBe("🏍️ Third-party");
  });
});

describe("isOrderType", () => {
  it("accepts the five and nothing else", () => {
    for (const t of ORDER_TYPES) expect(isOrderType(t)).toBe(true);
    expect(isOrderType("takeaway")).toBe(false);
    expect(isOrderType("")).toBe(false);
    expect(isOrderType(null)).toBe(false);
  });
});

describe("isOffPremise", () => {
  it("is everything that needs a bag rather than a table", () => {
    expect(isOffPremise("dine_in")).toBe(false);
    expect(isOffPremise("takeout")).toBe(true);
    expect(isOffPremise("pickup")).toBe(true);
    expect(isOffPremise("delivery")).toBe(true);
    expect(isOffPremise("third_party")).toBe(true);
  });
});

describe("needsAddress", () => {
  // Only a delivery we make ourselves needs one. A third-party rider collects
  // from the counter, so demanding an address there would block the order.
  it("is delivery only", () => {
    expect(needsAddress("delivery")).toBe(true);
    expect(needsAddress("third_party")).toBe(false);
    expect(needsAddress("pickup")).toBe(false);
    expect(needsAddress("takeout")).toBe(false);
    expect(needsAddress("dine_in")).toBe(false);
  });
});
