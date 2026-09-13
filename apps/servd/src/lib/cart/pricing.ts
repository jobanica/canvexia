import type {
  CartLine,
  CartLineModifier,
  DinerItem,
  Selection,
} from "./types";

/**
 * Pure pricing + validation for the diner cart. No React, no DB — so it's easy
 * to unit-test and is the single source of truth the UI relies on. Phase 5 will
 * re-validate the same rules on the SERVER before creating an order (never trust
 * the client for money).
 */

/** Unit price = base + sum of selected modifier deltas (centavos). */
export function unitPrice(item: DinerItem, selection: Selection): number {
  let total = item.price;
  for (const group of item.groups) {
    const chosen = selection[group.id] ?? [];
    for (const modId of chosen) {
      const mod = group.modifiers.find((m) => m.id === modId);
      if (mod) total += mod.priceDelta;
    }
  }
  return total;
}

/**
 * Validates a selection against each group's rules:
 *  - required group must have at least max(minSelect, 1) choices
 *  - an optional group can always be skipped entirely (no minimum), even if an
 *    old row still carries a minSelect from back when it was required
 *  - never exceed maxSelect
 * Returns the first human-readable problem, or null if valid.
 */
export function validateSelection(
  item: DinerItem,
  selection: Selection,
): string | null {
  for (const group of item.groups) {
    const count = (selection[group.id] ?? []).length;
    const min = group.required ? Math.max(group.minSelect, 1) : 0;

    if (count > group.maxSelect) {
      return `Choose at most ${group.maxSelect} for ${group.name}.`;
    }
    if (count < min) {
      return min === 1
        ? `Please choose an option for ${group.name}.`
        : `Choose at least ${min} for ${group.name}.`;
    }
  }
  return null;
}

/** Flattens a selection into the snapshot list stored on a cart line. */
export function selectionToLineModifiers(
  item: DinerItem,
  selection: Selection,
): CartLineModifier[] {
  const out: CartLineModifier[] = [];
  for (const group of item.groups) {
    for (const modId of selection[group.id] ?? []) {
      const mod = group.modifiers.find((m) => m.id === modId);
      if (mod) {
        out.push({
          modifierId: mod.id,
          groupId: group.id,
          name: mod.name,
          priceDelta: mod.priceDelta,
        });
      }
    }
  }
  return out;
}

/** Cart subtotal across all lines (centavos). */
export function cartTotal(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
}

/** Total item count (sum of quantities). */
export function cartCount(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}
