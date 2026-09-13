/**
 * One order for modifier groups, everywhere.
 *
 * The order a diner is asked questions in is set once, on the Modifiers page,
 * and every item that uses those groups asks in that same order. Previously it
 * came off the item↔group link, whose sortOrder was never written — so every
 * row tied at 0 and the database returned whatever order it liked. That's per
 * item, which is why one dish asked Size → Flavour → Add-ons and the next asked
 * Flavour → Add-ons → Size from the same three groups.
 *
 * Pure, because "did the sort actually come out the same for both items" is the
 * only thing worth testing here, and it needs no database to answer.
 */

export interface OrderableGroup {
  id: string;
  name: string;
  /** Null on a group created before the order existed, or not yet migrated. */
  sortOrder?: number | null;
}

/**
 * Sort by the order set on the Modifiers page.
 *
 * Groups with no order go last rather than first: an unordered group is one
 * nobody has placed yet, and dropping it above Size would rearrange a menu the
 * owner was happy with. Ties fall back to name and then id, so the result is
 * identical for every item and stable across requests — a sort that can return
 * two different answers for the same input is the bug this replaces.
 */
export function sortModifierGroups<T extends OrderableGroup>(groups: readonly T[]): T[] {
  return [...groups].sort((a, b) => {
    const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
}
