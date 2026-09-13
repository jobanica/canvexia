import type { CartLine, Selection } from "./types";

/**
 * Rebuild the item picker's state from a line already in the cart.
 *
 * This is what makes a cart line editable. Without it, changing your mind about
 * a size or an add-on meant deleting the line and building it again from
 * scratch — which is what diners were complaining about.
 *
 * Shared by the QR menu and the online storefront rather than written twice:
 * two copies of "which options were chosen" is two chances for one of them to
 * quietly lose the diner's add-ons on edit.
 */
export function selectionFromLine(line: CartLine): Selection {
  const out: Selection = {};
  for (const m of line.modifiers) {
    (out[m.groupId] ??= []).push(m.modifierId);
  }
  return out;
}

/**
 * Put an edited line back where it came from.
 *
 * Same line id, same position: a diner who changes a size expects that row to
 * change, not to disappear and reappear at the bottom of the list. Deliberately
 * NOT merged with an identical line — a merge on edit would silently double a
 * quantity, and the diner asked to change one row, not to combine two.
 */
export function replaceCartLine(lines: CartLine[], edited: CartLine): CartLine[] {
  return lines.some((l) => l.lineId === edited.lineId)
    ? lines.map((l) => (l.lineId === edited.lineId ? edited : l))
    : [...lines, edited];
}
