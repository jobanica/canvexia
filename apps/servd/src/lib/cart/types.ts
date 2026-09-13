/**
 * Shared diner-side types. These are the SERIALIZABLE shapes passed from the
 * server (menu loader) into the client cart components — plain data, money in
 * centavos.
 */

export interface DinerModifier {
  id: string;
  name: string;
  priceDelta: number; // centavos
  isAvailable?: boolean; // false = marked out (add-on ran out); shown disabled
}

export interface DinerModifierGroup {
  id: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number; // 1 => single-select, >1 => multi-select
  modifiers: DinerModifier[];
}

/** A size/variant option — an absolute base price (not a delta). */
export interface DinerVariant {
  id: string;
  name: string;
  price: number; // absolute base price, centavos (happy-hour adjusted for display)
  stock?: number | null; // pcs left for this size; null = untracked, 0 = sold out
}

export interface DinerItem {
  id: string;
  name: string;
  description: string | null;
  price: number; // centavos (for variant items: the lowest/"from" price)
  imageUrl: string | null;
  videoUrl: string | null;
  videoPosterUrl: string | null;
  isAvailable: boolean;
  /**
   * WHY it's unavailable, for the one screen that can do something about it.
   *
   * `isAvailable` above is the answer to "can I sell this right now" and every
   * diner-facing surface only needs that. The cashier POS needs the reason as
   * well, because its sold-out button moves the hand switch and nothing else:
   * `manualOut` says the switch is off, `autoOut` says something ran out. Both
   * optional — a caller that doesn't care can carry on ignoring them.
   */
  manualOut?: boolean;
  autoOut?: boolean;
  dietaryTags: string[]; // diet/allergen tag keys (see src/lib/menu/dietary.ts)
  originalPrice?: number | null; // pre-discount price when a happy hour is active
  groups: DinerModifierGroup[];
  variants?: DinerVariant[]; // sizes — when present the diner must pick one
}

export interface DinerCategory {
  id: string;
  name: string;
  items: DinerItem[];
}

/** What the diner picked: modifier ids chosen, keyed by group id. */
export type Selection = Record<string, string[]>;

/** A snapshot of one chosen modifier, kept on the cart line for display + order. */
export interface CartLineModifier {
  modifierId: string;
  groupId: string;
  name: string;
  priceDelta: number;
}

/** One line in the cart. unitPrice already includes the chosen size + modifiers. */
export interface CartLine {
  lineId: string; // client-generated, unique per line
  itemId: string;
  name: string; // includes the size for display, e.g. "Bangus (Large)"
  basePrice: number;
  unitPrice: number; // basePrice (or variant price) + sum(modifier deltas)
  quantity: number;
  modifiers: CartLineModifier[];
  note?: string;
  variantId?: string; // chosen size, if the item has variants
  /**
   * The item's photo, snapshotted onto the line so the cart can show what was
   * ordered. Display only — it is never sent with the order and never priced,
   * and lineSig deliberately ignores it, so two lines still merge on
   * item + size + note + modifiers regardless of the picture.
   */
  imageUrl?: string | null;
}
