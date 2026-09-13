/**
 * How many of each thing was sold.
 *
 * The question an owner actually asks at the end of a day — "how many burgers
 * did we sell?" — which order history couldn't answer, because it lists tickets
 * and a burger is spread across forty of them.
 *
 * GROUPED BY THE MENU ITEM, NOT THE LINE'S TEXT. An order line stores the name
 * as it was when it was rung up, which for a sized item reads "Burger (Large)".
 * Grouping on that text answers "how many large burgers", one size at a time,
 * and never the question that was asked. Grouping on the item id folds every
 * size and every past price back into one row.
 *
 * A line whose item has since been DELETED has no id to group by, so it falls
 * back to its snapshot name. That keeps last month's sales of a discontinued
 * dish in the report instead of silently dropping them.
 *
 * Revenue includes add-ons: a burger sold with extra cheese earned the price of
 * the cheese too, and leaving it out would make the report disagree with the
 * day's takings.
 *
 * Pure: no database, no clock.
 */

export interface SoldLineInput {
  /** Null when the menu item has since been deleted. */
  menuItemId: string | null;
  /** The name as it was rung up. */
  nameAtTime: string;
  quantity: number;
  /** Line's base unit price, in centavos. */
  unitPrice: number;
  /** Price deltas of the add-ons chosen on this line. */
  modifierDeltas: number[];
}

export interface ItemSold {
  key: string;
  name: string;
  quantity: number;
  /** Centavos, including add-ons. */
  revenue: number;
  /** True when the item is no longer on the menu. */
  deleted: boolean;
}

export interface ItemsSold {
  items: ItemSold[];
  totalQuantity: number;
  totalRevenue: number;
  /** How many distinct products sold at all. */
  distinctItems: number;
}

/**
 * The display name for a group.
 *
 * Sized lines are "Burger (Large)"; stripping the trailing bracket gives the
 * product back. Only the LAST bracketed group is removed, and only when the
 * item still exists — a dish genuinely called "Sisig (Sizzling)" keeps its name
 * once it's the only line for that id, because every line then agrees.
 */
function baseName(name: string): string {
  return name.replace(/\s*\([^()]*\)\s*$/, "").trim() || name;
}

export function rollUpItemsSold(lines: SoldLineInput[]): ItemsSold {
  const groups = new Map<string, { names: Map<string, number>; quantity: number; revenue: number; deleted: boolean }>();

  for (const l of lines) {
    const qty = Math.max(0, Math.floor(l.quantity));
    if (qty === 0) continue;

    const deleted = l.menuItemId == null;
    // Deleted items can only be grouped by what they were called.
    const key = deleted ? `name:${l.nameAtTime}` : `id:${l.menuItemId}`;
    const addOns = l.modifierDeltas.reduce((s, d) => s + d, 0);
    const revenue = (l.unitPrice + addOns) * qty;

    const g = groups.get(key) ?? { names: new Map<string, number>(), quantity: 0, revenue: 0, deleted };
    g.quantity += qty;
    g.revenue += revenue;
    // Track how often each spelling was used, so the label is the one the
    // owner sees most rather than whichever line happened to come back first.
    g.names.set(l.nameAtTime, (g.names.get(l.nameAtTime) ?? 0) + qty);
    groups.set(key, g);
  }

  const items: ItemSold[] = [...groups.entries()].map(([key, g]) => {
    const spellings = [...g.names.keys()];
    const commonest = [...g.names.entries()].sort((a, b) => b[1] - a[1])[0][0];
    // More than one spelling means sizes were involved — show the product, not
    // one arbitrary size.
    const name = spellings.length > 1 ? baseName(commonest) : commonest;
    return { key, name, quantity: g.quantity, revenue: g.revenue, deleted: g.deleted };
  });

  // Best seller first. Ties break on revenue then name so the order is stable
  // between loads — a report that reshuffles itself is one nobody trusts.
  items.sort(
    (a, b) => b.quantity - a.quantity || b.revenue - a.revenue || (a.name < b.name ? -1 : 1),
  );

  return {
    items,
    totalQuantity: items.reduce((s, i) => s + i.quantity, 0),
    totalRevenue: items.reduce((s, i) => s + i.revenue, 0),
    distinctItems: items.length,
  };
}
