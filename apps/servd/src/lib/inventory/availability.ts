/**
 * How many of a product can still be sold.
 *
 * On-hand isn't the answer. Stock comes off when an order is fulfilled, not
 * when it's placed, so between the two the count still reads as if nothing had
 * been sold. A shop with one unit left would accept an order for it, then keep
 * accepting more from everyone else who loaded the page — and only discover it
 * when someone has to be told their payment bought nothing.
 *
 * So what's sellable is what's on the shelf minus what's already promised:
 * every unit on an order that has been taken but not yet deducted. That figure
 * needs no new bookkeeping and can't drift. Cancel an order and its units stop
 * being promised; fulfil it and they come off the shelf instead. Neither path
 * has to remember to put anything back.
 *
 * Pure: the caller supplies both numbers.
 */

export interface StockPosition {
  /** Units counted on the shelf. */
  onHand: number;
  /** Units on orders taken but not yet deducted. */
  committed: number;
}

export interface StockState {
  onHand: number;
  committed: number;
  /** What can still be sold. Never negative — you can't promise less than none. */
  available: number;
  soldOut: boolean;
}

export function stockState({ onHand, committed }: StockPosition): StockState {
  const available = Math.max(0, onHand - committed);
  return { onHand, committed, available, soldOut: available <= 0 };
}

/**
 * Build the per-product view from the two lists a caller reads.
 *
 * Products absent from `stock` simply don't appear: no count kept means no
 * limit to enforce, which is the right answer for a kitchen that measures in
 * ingredients and for anything nobody has started counting yet.
 */
export function stockStates(
  stock: { menuItemId: string | null; stockQty: number }[],
  committed: { menuItemId: string | null; quantity: number }[],
): Map<string, StockState> {
  const promised = new Map<string, number>();
  for (const c of committed) {
    if (c.menuItemId == null) continue;
    promised.set(c.menuItemId, (promised.get(c.menuItemId) ?? 0) + Math.max(0, c.quantity));
  }

  const out = new Map<string, StockState>();
  for (const s of stock) {
    if (s.menuItemId == null) continue;
    out.set(s.menuItemId, stockState({ onHand: s.stockQty, committed: promised.get(s.menuItemId) ?? 0 }));
  }
  return out;
}
