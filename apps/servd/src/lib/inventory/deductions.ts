/**
 * What a sale takes out of stock.
 *
 * Two kinds of stock exist and an order can consume both at once:
 *
 *   - INGREDIENTS, via a recipe. Selling one adobo consumes 0.25 kg of pork.
 *   - PRODUCTS, counted directly. Selling one tumbler consumes one tumbler.
 *
 * A restaurant needs the first; a shop selling finished goods needs the second;
 * a café selling both meals and packaged beans needs both on the same order.
 * So this doesn't branch on "restaurant or ecommerce" — it takes every link
 * from a sellable item to a stock row and adds up the quantities. A product
 * tracked directly is simply a link with a quantity of one.
 *
 * Pure: no database, no clock. The caller does the reading and writing.
 */

/** One line of an order: how many of a menu item / product were sold. */
export interface SoldLine {
  menuItemId: string | null;
  quantity: number;
}

/** "Selling 1 of menuItemId consumes `quantity` of inventoryItemId." */
export interface StockLink {
  menuItemId: string;
  inventoryItemId: string;
  quantity: number;
}

export interface Deduction {
  inventoryItemId: string;
  quantity: number;
}

/**
 * Turn product-stock rows into links. Each is 1:1 with what's sold — one unit
 * off the shelf per unit on the receipt.
 */
export function productStockLinks(
  rows: { id: string; menuItemId: string | null }[],
): StockLink[] {
  return rows
    .filter((r): r is { id: string; menuItemId: string } => r.menuItemId != null)
    .map((r) => ({ menuItemId: r.menuItemId, inventoryItemId: r.id, quantity: 1 }));
}

/**
 * Total to remove from each stock row for a whole order.
 *
 * Lines are summed rather than applied one at a time: an order with three
 * separate lines of the same product must deduct three, and two dishes sharing
 * an ingredient must deduct both their shares from the one row. Applying each
 * line separately would mean read-modify-write per line and the last write
 * would win, quietly losing the others.
 *
 * Sorted by id so the write order — and therefore the lock order — is stable
 * across concurrent orders. Two tills closing overlapping orders at the same
 * moment then queue instead of deadlocking.
 */
export function planDeductions(lines: readonly SoldLine[], links: StockLink[]): Deduction[] {
  const byMenuItem = new Map<string, StockLink[]>();
  for (const l of links) {
    const list = byMenuItem.get(l.menuItemId);
    if (list) list.push(l);
    else byMenuItem.set(l.menuItemId, [l]);
  }

  const totals = new Map<string, number>();
  for (const line of lines) {
    if (line.menuItemId == null || !(line.quantity > 0)) continue;
    for (const link of byMenuItem.get(line.menuItemId) ?? []) {
      if (!(link.quantity > 0)) continue;
      totals.set(
        link.inventoryItemId,
        (totals.get(link.inventoryItemId) ?? 0) + link.quantity * line.quantity,
      );
    }
  }

  return [...totals]
    .map(([inventoryItemId, quantity]) => ({ inventoryItemId, quantity }))
    .sort((a, b) => (a.inventoryItemId < b.inventoryItemId ? -1 : 1));
}

/**
 * Which products can no longer be sold, given the stock rows that hit zero.
 *
 * A depleted ingredient takes down every dish whose recipe needs it; a depleted
 * product takes down only itself. Both fall out of the same link table, so one
 * lookup answers for both.
 */
export function productsToDisable(depletedInventoryIds: string[], links: StockLink[]): string[] {
  const depleted = new Set(depletedInventoryIds);
  const out = new Set<string>();
  for (const l of links) {
    if (depleted.has(l.inventoryItemId)) out.add(l.menuItemId);
  }
  return [...out];
}
