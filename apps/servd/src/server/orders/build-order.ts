import "server-only";

import { tenantDb } from "@/server/tenancy/scoped-db";
import { unitPrice, validateSelection } from "@/lib/cart/pricing";
import { effectivePrice } from "@/lib/pricing/happy-hour";
import { getActiveHappyHoursTenant } from "@/server/pricing/happy-hour";
import { getServingStates } from "@/server/menu/servings";
import { getVariantsMap } from "@/server/menu/variants";
import { getUnavailableModifierIds } from "@/server/menu/modifier-availability";
import { getModifierGroupOrder } from "@/server/menu/modifier-order";
import { sortModifierGroups } from "@/lib/menu/modifier-order";
import { getDishStock } from "@/server/inventory/dish-stock";
import { getPosOnlyItemIds } from "@/server/menu/pos-only";
import { variantPrice } from "@/lib/menu/variant-price";
import type { DinerItem, Selection } from "@/lib/cart/types";

/**
 * Shared, server-side order validation + pricing. Both the diner (`placeOrder`)
 * and the cashier POS (`createCashierOrder`) build orders through here so the
 * money rules live in exactly one place.
 *
 * SECURITY: the caller only sends item ids + quantities + chosen modifier ids.
 * We load the REAL menu items from the DB, re-run the same validation as the
 * cart, recompute every price, and snapshot names + prices onto the order so it
 * stays correct even if the menu changes later.
 */

export interface OrderLineInput {
  itemId: string;
  quantity: number;
  note?: string | null;
  modifierIds: string[];
  variantId?: string | null; // chosen size, if the item has variants
}

export interface BuiltOrderItem {
  menuItemId: string;
  nameAtTime: string;
  quantity: number;
  unitPrice: number;
  note: string | null;
  modifiers: { modifierId: string; nameAtTime: string; priceDeltaAtTime: number }[];
  variantId?: string | null; // chosen size (for per-size stock decrement; not persisted on OrderItem)
}

export interface BuiltOrder {
  total: number;
  items: BuiltOrderItem[];
}

/** Thrown when the submitted lines fail validation (sold out, bad modifier…). */
export class OrderValidationError extends Error {}

/**
 * Where the order is being rung up. Counter-only items are punchable at the
 * till and refused everywhere else — the storefront hides them, and this makes
 * hiding them irrelevant to whether they can be ordered.
 */
export type OrderChannel = "web" | "pos";

export async function buildValidatedOrder(
  restaurantId: string,
  lines: OrderLineInput[],
  opts: { channel?: OrderChannel } = {},
): Promise<BuiltOrder> {
  if (!lines.length) throw new OrderValidationError("Your order is empty.");
  // Defaults to the diner's channel: a caller that forgets to say gets the
  // stricter rule, never the looser one.
  const channel = opts.channel ?? "web";

  const itemIds = [...new Set(lines.map((l) => l.itemId))];
  const dbItems = await tenantDb(restaurantId, (tx) =>
    tx.menuItem.findMany({
      where: { id: { in: itemIds } },
      include: {
        modifierGroups: {
          // Explicit columns throughout — `isAvailable` on a modifier and
          // `sortOrder` on a group each land in a manual migration and are
          // layered on separately, so an un-migrated database can still take
          // orders. A till that can't ring up a sale is the worst failure here.
          include: {
            group: {
              select: {
                id: true,
                name: true,
                required: true,
                minSelect: true,
                maxSelect: true,
                modifiers: { select: { id: true, name: true, priceDelta: true } },
              },
            },
          },
        },
      },
    }),
  );
  const itemMap = new Map(dbItems.map((i) => [i.id, i]));
  const groupOrder = await getModifierGroupOrder(restaurantId);

  // Active happy-hour rules → the authoritative base price per item (the client
  // is never trusted for the discounted price).
  const happyHours = await getActiveHappyHoursTenant(restaurantId);

  // Daily servings caps (only items with a configured limit appear here).
  const servings = await getServingStates(restaurantId, itemIds);
  // Sizes/variants per item (best-effort). Prices are re-resolved server-side.
  const variantsMap = await getVariantsMap(itemIds);
  // Add-ons marked out by the kitchen — rejected here too, so a stale menu on
  // someone's phone can't sneak an unavailable option into a real order.
  const modsOut = await getUnavailableModifierIds(restaurantId);
  // How many of each dish can still be made, counting BOTH a recipe's
  // ingredients and a product's own units, and after subtracting everything
  // already promised to orders in progress. Empty for anyone not tracking
  // stock, which is how it behaved before inventory existed.
  const dishStock = await getDishStock(restaurantId, itemIds);
  // Counter-only items. The storefront never renders them, so reaching one from
  // the web means a stale page or a crafted request — either way it's refused
  // here rather than trusted to have been hidden.
  const posOnly = channel === "pos" ? new Set<string>() : await getPosOnlyItemIds(restaurantId);

  let total = 0;
  const items: BuiltOrderItem[] = [];
  const usedByItem = new Map<string, number>(); // cumulative qty this order, per item
  const usedByStock = new Map<string, number>(); // cumulative qty this order, per stocked product
  const usedByVariant = new Map<string, number>(); // cumulative qty this order, per size

  for (const line of lines) {
    const dbItem = itemMap.get(line.itemId);
    if (!dbItem) throw new OrderValidationError("An item is no longer on the menu.");
    // Same wording as a delisted item on purpose: the storefront shouldn't
    // confirm that a counter-only item exists.
    if (posOnly.has(dbItem.id)) throw new OrderValidationError("An item is no longer on the menu.");
    if (!dbItem.isAvailable) throw new OrderValidationError(`"${dbItem.name}" is sold out.`);

    // Enforce the per-day servings cap (counts every line of this item together).
    const cap = servings.get(dbItem.id);
    if (cap && cap.remaining != null) {
      const wanted = (usedByItem.get(dbItem.id) ?? 0) + line.quantity;
      if (cap.remaining <= 0) {
        throw new OrderValidationError(`"${dbItem.name}" is sold out for today.`);
      }
      if (wanted > cap.remaining) {
        throw new OrderValidationError(
          `Only ${cap.remaining} "${dbItem.name}" left for today.`,
        );
      }
      usedByItem.set(dbItem.id, wanted);
    }

    // Enforce counted stock. Checked here rather than trusted from the menu's
    // sold-out flag, which only flips once an order is fulfilled: without this,
    // everyone who had the page open could order the same last portion, and a
    // cashier with three portions in the fridge could accept ten tickets.
    const stock = dishStock.get(dbItem.id);
    if (stock?.makeable != null) {
      const wanted = (usedByStock.get(dbItem.id) ?? 0) + line.quantity;
      if (stock.makeable <= 0) {
        throw new OrderValidationError(
          stock.limitingIngredient
            ? `"${dbItem.name}" is sold out — no ${stock.limitingIngredient} left.`
            : `"${dbItem.name}" is sold out.`,
        );
      }
      if (wanted > stock.makeable) {
        throw new OrderValidationError(`Only ${stock.makeable} "${dbItem.name}" left.`);
      }
      usedByStock.set(dbItem.id, wanted);
    }

    // If the item has sizes, the chosen size sets the base price (re-resolved
    // from the DB — the client never dictates the amount). Fall back to the first
    // in-stock size if none/an unknown one was sent; the size name rides on
    // nameAtTime, and per-size stock (pcs) is enforced here.
    const variants = variantsMap.get(dbItem.id) ?? [];
    let baseAmount = dbItem.price;
    let nameAtTime = dbItem.name;
    let chosenVariantId: string | null = null;
    if (variants.length > 0) {
      const chosenVariant =
        variants.find((v) => v.id === line.variantId) ??
        variants.find((v) => v.stock == null || v.stock > 0) ??
        variants[0];
      // A size whose price was never filled in charges the item's price, not
      // nothing. Selling Large for ₱0 because a box was left blank is how an
      // order ends up totalling zero and vanishing from every report.
      baseAmount = variantPrice(chosenVariant.price, dbItem.price);
      nameAtTime = `${dbItem.name} (${chosenVariant.name})`;
      chosenVariantId = chosenVariant.id;

      // Per-size stock: auto sold-out at 0, and can't over-order what's left.
      if (chosenVariant.stock != null) {
        const wanted = (usedByVariant.get(chosenVariant.id) ?? 0) + line.quantity;
        if (chosenVariant.stock <= 0) {
          throw new OrderValidationError(`"${nameAtTime}" is sold out.`);
        }
        if (wanted > chosenVariant.stock) {
          throw new OrderValidationError(`Only ${chosenVariant.stock} of "${nameAtTime}" left.`);
        }
        usedByVariant.set(chosenVariant.id, wanted);
      }
    }

    const effBase = effectivePrice(
      baseAmount,
      { id: dbItem.id, categoryId: dbItem.categoryId },
      happyHours,
    ).price;

    const dinerItem: DinerItem = {
      id: dbItem.id,
      name: dbItem.name,
      description: dbItem.description,
      price: effBase,
      imageUrl: dbItem.imageUrl,
      videoUrl: dbItem.videoUrl,
      videoPosterUrl: dbItem.videoPosterUrl,
      isAvailable: dbItem.isAvailable,
      dietaryTags: dbItem.dietaryTags ?? [],
      // Same order as the diner menu and the Modifiers page — the cashier
      // shouldn't be reading a different sequence to the customer.
      groups: sortModifierGroups(
        dbItem.modifierGroups.map((l) => ({
          ...l.group,
          sortOrder: groupOrder.get(l.group.id) ?? null,
        })),
      ).map((group) => ({
        id: group.id,
        name: group.name,
        required: group.required,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        modifiers: group.modifiers.map((m) => ({
          id: m.id,
          name: m.name,
          priceDelta: m.priceDelta,
        })),
      })),
    };

    // Map flat modifier ids back to their groups; reject anything foreign.
    const selection: Selection = {};
    const chosen: { modifierId: string; nameAtTime: string; priceDeltaAtTime: number }[] = [];
    for (const modId of line.modifierIds) {
      const group = dinerItem.groups.find((g) => g.modifiers.some((m) => m.id === modId));
      const mod = group?.modifiers.find((m) => m.id === modId);
      if (!group || !mod) throw new OrderValidationError("An option is no longer available.");
      if (modsOut.has(mod.id)) throw new OrderValidationError(`"${mod.name}" is sold out.`);
      (selection[group.id] ??= []).push(modId);
      chosen.push({ modifierId: mod.id, nameAtTime: mod.name, priceDeltaAtTime: mod.priceDelta });
    }

    const ruleError = validateSelection(dinerItem, selection);
    if (ruleError) throw new OrderValidationError(ruleError);

    const linePrice = unitPrice(dinerItem, selection);
    total += linePrice * line.quantity;

    items.push({
      menuItemId: dbItem.id,
      nameAtTime, // includes the chosen size, e.g. "Bangus (Large)"
      quantity: line.quantity,
      unitPrice: effBase, // happy-hour-adjusted base snapshot; deltas live on modifiers
      note: line.note ?? null,
      modifiers: chosen,
      variantId: chosenVariantId,
    });
  }

  // Merge truly-identical lines — same item, size, note AND modifiers — into one
  // row with a summed quantity, so the order shows "4× Ube De Leche" instead of
  // four separate "1×" rows on the merchant board, kitchen ticket and receipt.
  const merged = new Map<string, BuiltOrderItem>();
  for (const it of items) {
    const modSig = it.modifiers
      .map((m) => `${m.modifierId}:${m.priceDeltaAtTime}`)
      .sort()
      .join(",");
    const key = `${it.menuItemId}|${it.variantId ?? ""}|${it.note ?? ""}|${modSig}`;
    const existing = merged.get(key);
    if (existing) existing.quantity += it.quantity;
    else merged.set(key, { ...it, modifiers: [...it.modifiers] });
  }

  return { total, items: [...merged.values()] };
}

/** Prisma-shaped nested create for an order's items. */
export function orderItemsCreate(items: BuiltOrderItem[]) {
  return items.map((oi) => ({
    menuItemId: oi.menuItemId,
    nameAtTime: oi.nameAtTime,
    quantity: oi.quantity,
    unitPrice: oi.unitPrice,
    note: oi.note,
    modifiers: { create: oi.modifiers },
  }));
}
