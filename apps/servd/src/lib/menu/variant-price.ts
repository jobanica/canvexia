/**
 * What a size actually costs.
 *
 * Sizes are stored with their own price, and the editor accepts a blank one as
 * zero. So an item priced ₱100 with a "Large" whose price was never filled in
 * sells Large for nothing — silently, at full speed, with no error anywhere.
 * The order goes through, its lines snapshot ₱0, the order totals ₱0, no
 * payment is ever recorded against it, and it becomes invisible to revenue, to
 * accounting and to the shift report. The only place it shows up is the order
 * history, listed at ₱0.00.
 *
 * A size with no price falls back to the item's own price instead. A giveaway
 * is a deliberate act — you make the ITEM free — and an unfilled box is not.
 * When the item itself is free, the size stays free, because then it really was
 * deliberate.
 *
 * Pure, and the single source of this rule: the storefront's displayed price
 * and the price the server charges are computed the same way, or the menu says
 * one thing and the till does another.
 */
export function variantPrice(sizePrice: number | null | undefined, itemPrice: number): number {
  const size = Number(sizePrice);
  if (Number.isFinite(size) && size > 0) return Math.round(size);
  return Math.max(0, Math.round(Number(itemPrice) || 0));
}

/** True when a size is riding on the item's price because it has none of its own. */
export function sizeHasNoPriceOfItsOwn(sizePrice: number | null | undefined): boolean {
  const size = Number(sizePrice);
  return !Number.isFinite(size) || size <= 0;
}
