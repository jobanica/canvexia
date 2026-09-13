/**
 * The one place an order type gets a name.
 *
 * The same order used to read "Takeout" where it was punched, "Pickup" on the
 * cashier board and "Takeaway" on the kitchen display — three words for one
 * thing, on three screens the same staff use to assemble one bag. Every surface
 * now labels through here, so they cannot drift apart again.
 *
 * Pure, so the labels are testable and safe to import from client components.
 */

export const ORDER_TYPES = [
  "dine_in",
  "takeout",
  "pickup",
  "delivery",
  "third_party",
] as const;

export type OrderTypeKey = (typeof ORDER_TYPES)[number];

/**
 * Takeout vs pickup is a real distinction on the floor, not a synonym:
 *   takeout — ordered AT the counter, waiting for it, takes it away
 *   pickup  — ordered ahead (online or by phone), coming to collect it
 * The kitchen assembles those differently, which is the whole reason the two
 * words needed separating instead of unifying.
 */
export const ORDER_TYPE_LABEL: Record<OrderTypeKey, string> = {
  dine_in: "Dine-in",
  takeout: "Takeout",
  pickup: "Pickup",
  delivery: "Delivery",
  third_party: "Third-party",
};

export const ORDER_TYPE_EMOJI: Record<OrderTypeKey, string> = {
  dine_in: "🍽️",
  takeout: "🥡",
  pickup: "🛍️",
  delivery: "🛵",
  third_party: "🏍️",
};

/** Longer wording for pickers, where there's room to remove the ambiguity. */
export const ORDER_TYPE_HINT: Record<OrderTypeKey, string> = {
  dine_in: "Eating in, at a table",
  takeout: "Ordered at the counter, taking it away",
  pickup: "Ordered ahead, collecting it",
  delivery: "You deliver it",
  third_party: "Grab, Foodpanda or similar",
};

export function isOrderType(v: unknown): v is OrderTypeKey {
  return typeof v === "string" && (ORDER_TYPES as readonly string[]).includes(v);
}

/** "Takeout". Unknown or missing values read as Dine-in, the default. */
export function orderTypeLabel(v: unknown): string {
  return isOrderType(v) ? ORDER_TYPE_LABEL[v] : ORDER_TYPE_LABEL.dine_in;
}

/** "🥡 Takeout" — for cards and buttons where the glyph aids a quick scan. */
export function orderTypeLabelWithEmoji(v: unknown): string {
  const key = isOrderType(v) ? v : "dine_in";
  return `${ORDER_TYPE_EMOJI[key]} ${ORDER_TYPE_LABEL[key]}`;
}

/** Every type that leaves the building — i.e. needs a bag, not a table. */
export function isOffPremise(v: unknown): boolean {
  return isOrderType(v) && v !== "dine_in";
}

/** Types that need a delivery address rather than just a name. */
export function needsAddress(v: unknown): boolean {
  return v === "delivery";
}
