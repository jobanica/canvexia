/**
 * WHICH BRANCH'S STOCK A QUERY MAY SEE.
 *
 * REPORTED — "i tried to check the toril branch, but it has all the inventory
 * from the main branch, i never added any inventory in toril branch."
 *
 * `branchWhere` has existed since branches shipped, and SEVEN readers never
 * called it: the catalogue, purchase-order options, write-off candidates,
 * stocktake, the storefront, supplier stats — and, worst of all, the SALE.
 * FEFO was allocating across every branch's batches, so a sale rung up at Toril
 * could take stock off a batch physically sitting in Main and leave neither
 * shelf matching its count.
 *
 * `branchWhere` takes a BranchContext, which comes from a cookie and belongs to
 * a person looking at a screen. The sale path has no such thing — it has the
 * branch its till is at. So the rule lives here, in one pure function both can
 * reach, rather than being written out a second time from memory.
 *
 * NULL MEANS THE MAIN BRANCH. Every pre-branch row was backfilled, but a row
 * written by a path not yet taught about branches must land somewhere real
 * instead of vanishing from every per-branch total.
 */

export type StockScope =
  | Record<string, never>
  | { branchId: string }
  | { OR: { branchId: string | null }[] };

export function stockScope(
  branchId: string | null,
  mainBranchId: string | null,
): StockScope {
  // A pharmacy with no branches has one implicit location, and every row's
  // branchId is null. Filtering would hide all of it.
  if (mainBranchId === null) return {};

  // The main branch also owns everything not yet filed anywhere.
  if (branchId === null || branchId === mainBranchId) {
    return { OR: [{ branchId: mainBranchId }, { branchId: null }] };
  }

  // Any other branch sees ONLY its own. This is the line that was missing: a
  // branch with no stock in it must read as empty, not as a copy of main.
  return { branchId };
}
