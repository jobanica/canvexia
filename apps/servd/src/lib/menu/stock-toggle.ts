import type { DinerCategory, DinerItem } from "@/lib/cart/types";

/**
 * The rules behind "86 it" — the cashier marking a dish sold out from the till.
 *
 * An item can be sold out for two unrelated reasons, and the till has to tell
 * them apart or it will lie to whoever taps it:
 *
 *   - MANUAL — somebody flipped the switch off, from the menu editor or from
 *     here. Tapping again puts it straight back on the menu.
 *   - AUTOMATIC — the daily servings cap is used up, every size ran out, or
 *     the counted stock hit zero. The hand switch has no say in that, so
 *     turning it "on" changes the switch and leaves the item still sold out.
 *
 * Pure functions, no I/O: the till patches its own copy of the menu with these
 * so a tap shows immediately instead of waiting for a round-trip.
 */

/** Just the availability facts — so callers can pass a whole DinerItem or a stub. */
export interface StockFlags {
  isAvailable: boolean;
  /** The hand switch is off (menu_items.isAvailable = false). */
  manualOut?: boolean;
  /** Out by count: daily cap used up, every size gone, or no stock left. */
  autoOut?: boolean;
}

/**
 * What one tap should set the hand switch to.
 *
 * Reads off `manualOut` rather than `isAvailable`, because those disagree
 * exactly when it matters: an item that ran out of counted stock shows as
 * unavailable while its hand switch is still on, and the tap has to turn that
 * switch OFF (sold out) rather than uselessly re-affirming it.
 */
export function nextAvailability(flags: StockFlags): boolean {
  return flags.manualOut === true;
}

/**
 * What to tell the cashier after the tap, or null when the tile already says it.
 *
 * The only case that genuinely needs words is turning an item back on while
 * something else is still holding it down — the tile stays greyed out and,
 * without a line of explanation, that reads as the button being broken.
 */
export function stockToggleMessage(
  name: string,
  flags: StockFlags,
  nowAvailable: boolean,
): string | null {
  if (!nowAvailable) return `${name} is now sold out — it's off the menu everywhere.`;
  if (flags.autoOut) {
    return `${name} is switched back on, but it's still sold out because it has run out. Restock it (or raise today's limit) to sell it again.`;
  }
  return `${name} is back on the menu.`;
}

/**
 * Patch the till's in-memory menu after a successful toggle.
 *
 * `isAvailable` is recomputed the same way the menu loader computes it — the
 * hand switch AND nothing counted running out — so an item that's out of stock
 * doesn't flicker back to sellable just because the switch moved.
 */
export function applyStockToggle(
  categories: DinerCategory[] | null,
  itemId: string,
  available: boolean,
): DinerCategory[] | null {
  if (!categories) return categories;
  return categories.map((category) => ({
    ...category,
    items: category.items.map((item): DinerItem => {
      if (item.id !== itemId) return item;
      return {
        ...item,
        manualOut: !available,
        isAvailable: available && !item.autoOut,
      };
    }),
  }));
}
