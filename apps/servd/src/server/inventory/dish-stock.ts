import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { productStockLinks, type StockLink } from "@/lib/inventory/deductions";
import {
  availabilityFor,
  committedByItem,
  dishStock,
  type DishStock,
} from "@/lib/inventory/makeable";

/**
 * How many of each dish can still be sold, right now.
 *
 * Counts BOTH ways stock is kept — a recipe's ingredients and a product's own
 * units — and subtracts what orders already taken have promised but not yet
 * consumed. That gap is the bug this exists for: deduction happens when the
 * kitchen finishes, so without it a cashier looking at three portions could
 * accept ten orders and nothing would say a word.
 *
 * Best-effort throughout. An empty map means "nothing is limited", which is
 * exactly how every restaurant behaved before inventory existed — a failure
 * here must never stop a shop taking orders.
 */
export async function getDishStock(
  restaurantId: string,
  menuItemIds: string[],
): Promise<Map<string, DishStock>> {
  const none = new Map<string, DishStock>();
  if (menuItemIds.length === 0) return none;

  try {
    // Recipes first: without one, an ingredient limits nothing.
    const recipes: StockLink[] = await systemDb((tx) =>
      tx.recipeComponent.findMany({
        where: { restaurantId, menuItemId: { in: menuItemIds } },
        select: { menuItemId: true, inventoryItemId: true, quantity: true },
      }),
    ).catch(() => []);

    // Products whose own units are counted (1:1 with what's sold).
    const products: StockLink[] = await systemDb((tx) =>
      tx.inventoryItem.findMany({
        where: { restaurantId, menuItemId: { in: menuItemIds } },
        select: { id: true, menuItemId: true },
      }),
    )
      .then(productStockLinks)
      .catch(() => []);

    const links = [...recipes, ...products];
    if (links.length === 0) return none;

    // On-hand for every stock row any of these dishes touches.
    const ids = [...new Set(links.map((l) => l.inventoryItemId))];
    const rows = await systemDb((tx) =>
      tx.inventoryItem.findMany({
        where: { id: { in: ids }, restaurantId },
        select: { id: true, name: true, stockQty: true },
      }),
    );
    const onHand = new Map(rows.map((r) => [r.id, r.stockQty]));
    const nameOf = new Map(rows.map((r) => [r.id, r.name]));

    // What's already promised: every order taken but not yet deducted. The
    // same `inventoryDeductedAt is null` test the deduction itself uses, so a
    // ticket can never be counted as both promised and consumed.
    const openLines = await systemDb((tx) =>
      tx.orderItem.findMany({
        where: {
          order: {
            restaurantId,
            inventoryDeductedAt: null,
            status: { notIn: ["cancelled", "closed"] },
          },
        },
        select: { menuItemId: true, quantity: true },
      }),
    ).catch(() => []);

    // EVERY link in the restaurant feeds the commitment, not just the dishes
    // being asked about: the pork promised to an adobo is gone from the sisig
    // too, so asking only about sisig would miss it and oversell again.
    const [allRecipes, allProducts] = await Promise.all([
      systemDb((tx) =>
        tx.recipeComponent.findMany({
          where: { restaurantId },
          select: { menuItemId: true, inventoryItemId: true, quantity: true },
        }),
      ).catch(() => recipes),
      systemDb((tx) =>
        tx.inventoryItem.findMany({
          where: { restaurantId, menuItemId: { not: null } },
          select: { id: true, menuItemId: true },
        }),
      )
        .then(productStockLinks)
        .catch(() => products),
    ]);

    const availability = availabilityFor(
      onHand,
      committedByItem(openLines, [...allRecipes, ...allProducts]),
    );

    const byItem = new Map<string, StockLink[]>();
    for (const l of links) {
      const list = byItem.get(l.menuItemId) ?? [];
      list.push(l);
      byItem.set(l.menuItemId, list);
    }

    const out = new Map<string, DishStock>();
    for (const [menuItemId, itemLinks] of byItem) {
      out.set(menuItemId, dishStock(itemLinks, availability, (id) => nameOf.get(id) ?? "ingredient"));
    }
    return out;
  } catch {
    return none;
  }
}
