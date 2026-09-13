import { planDeductions, type SoldLine, type StockLink } from "./deductions";

/**
 * How many more of a dish can still be made.
 *
 * THE BUG THIS EXISTS FOR: stock came off when the kitchen marked an order
 * done, so between accepting an order and cooking it, the count still read
 * full. With three portions of pork in the fridge a cashier could accept five
 * orders, ten orders — nothing stopped them and nothing warned them, and the
 * kitchen found out at the pass.
 *
 * The fix is NOT to deduct earlier. The pork is still in the fridge until it's
 * cooked, and a stock figure that disagrees with a physical count breaks stock
 * counts and puts COGS on the wrong day. What was missing is the difference
 * between what's ON HAND and what's still AVAILABLE:
 *
 *     available = on hand − promised to orders already taken
 *
 * Promised means: accepted, being cooked, or cooked but not yet deducted.
 * Nothing new is recorded and nothing can drift — cancel an order and it stops
 * being promised; finish it and it moves out of promised and off the shelf. No
 * restore path to forget.
 *
 * Pure: no database, no clock.
 */

/** Availability of one stock row. */
export interface Availability {
  onHand: number;
  committed: number;
  available: number;
}

/**
 * What every open order has already promised, per stock row.
 *
 * `openLines` are the lines of orders taken but not yet deducted; `links` maps
 * a menu item to what it consumes (a recipe, or a product's own 1:1 stock row).
 */
export function committedByItem(openLines: SoldLine[], links: StockLink[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of planDeductions(openLines, links)) out.set(d.inventoryItemId, d.quantity);
  return out;
}

export function availabilityFor(
  onHandByItem: Map<string, number>,
  committed: Map<string, number>,
): Map<string, Availability> {
  const out = new Map<string, Availability>();
  for (const [inventoryItemId, onHand] of onHandByItem) {
    const c = committed.get(inventoryItemId) ?? 0;
    out.set(inventoryItemId, { onHand, committed: c, available: onHand - c });
  }
  return out;
}

/**
 * Servings of one dish still makeable from what's available.
 *
 * The scarcest ingredient decides: two hundred buns and one patty is one
 * burger. Returns null when nothing about the dish is stock-tracked — an
 * untracked dish is unlimited, not zero, and getting that backwards would take
 * a restaurant's whole menu off sale the moment this shipped.
 *
 * Never negative: already oversold reads as none left, not as a debt.
 */
export function makeableServings(
  itemLinks: StockLink[],
  availability: Map<string, Availability>,
): number | null {
  let limit: number | null = null;
  for (const link of itemLinks) {
    if (!(link.quantity > 0)) continue;
    const a = availability.get(link.inventoryItemId);
    // An ingredient with no stock row isn't being counted, so it limits nothing.
    if (!a) continue;
    const possible = Math.max(0, Math.floor(a.available / link.quantity));
    limit = limit == null ? possible : Math.min(limit, possible);
  }
  return limit;
}

export interface DishStock {
  /** Servings still makeable; null = not stock-tracked. */
  makeable: number | null;
  soldOut: boolean;
  /** Running low — worth warning a cashier about before they promise more. */
  low: boolean;
  /** The ingredient that runs out first, for a message worth reading. */
  limitingIngredient: string | null;
}

/** Below this many servings left, a cashier gets told before they accept more. */
export const LOW_STOCK_SERVINGS = 5;

export function dishStock(
  itemLinks: StockLink[],
  availability: Map<string, Availability>,
  nameOf: (inventoryItemId: string) => string,
): DishStock {
  const makeable = makeableServings(itemLinks, availability);
  if (makeable == null) {
    return { makeable: null, soldOut: false, low: false, limitingIngredient: null };
  }

  // Name whichever ingredient is actually the constraint, so the warning says
  // "pork is nearly out" rather than the useless "this dish is nearly out".
  let limiting: string | null = null;
  let worst = Infinity;
  for (const link of itemLinks) {
    if (!(link.quantity > 0)) continue;
    const a = availability.get(link.inventoryItemId);
    if (!a) continue;
    const possible = Math.max(0, Math.floor(a.available / link.quantity));
    if (possible < worst) {
      worst = possible;
      limiting = nameOf(link.inventoryItemId);
    }
  }

  return {
    makeable,
    soldOut: makeable <= 0,
    low: makeable > 0 && makeable <= LOW_STOCK_SERVINGS,
    limitingIngredient: limiting,
  };
}
