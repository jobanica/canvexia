import "server-only";

import { systemDb, tenantDb } from "@/server/tenancy/scoped-db";

/**
 * Per-item sizes/variants. Loaded via a SEPARATE best-effort query (not a Prisma
 * include on the menu queries) so existing menu/order reads never break if the
 * menu_item_variants table isn't migrated yet.
 */

export interface Variant {
  id: string;
  name: string;
  price: number; // absolute, centavos
  stock: number | null; // pcs left for this size; null = untracked, 0 = sold out
}

/** Variants per item id (system context — used by the public menu + order build). */
export async function getVariantsMap(itemIds: string[]): Promise<Map<string, Variant[]>> {
  const map = new Map<string, Variant[]>();
  if (itemIds.length === 0) return map;
  try {
    const rows = await systemDb((tx) =>
      tx.menuItemVariant.findMany({
        where: { menuItemId: { in: itemIds } },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, menuItemId: true, name: true, price: true, stock: true },
      }),
    );
    for (const r of rows) {
      const list = map.get(r.menuItemId) ?? [];
      list.push({ id: r.id, name: r.name, price: r.price, stock: r.stock ?? null });
      map.set(r.menuItemId, list);
    }
  } catch {
    /* menu_item_variants not migrated yet → no variants */
  }
  return map;
}

/** A single item's variants, tenant-scoped (for the admin edit page). Best-effort. */
export async function getItemVariants(restaurantId: string, menuItemId: string): Promise<Variant[]> {
  try {
    const rows = await tenantDb(restaurantId, (tx) =>
      tx.menuItemVariant.findMany({
        where: { menuItemId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, price: true, stock: true },
      }),
    );
    return rows.map((r) => ({ ...r, stock: r.stock ?? null }));
  } catch {
    return [];
  }
}

/**
 * Replace an item's full variant list (delete + recreate) in one tenant tx.
 * Best-effort: silently no-ops if the table isn't migrated. `list` items with a
 * blank name are dropped; an empty list clears all variants for the item.
 */
export async function setItemVariants(
  restaurantId: string,
  menuItemId: string,
  list: { name: string; price: number; stock?: number | null }[],
): Promise<void> {
  const clean = list
    .map((v) => ({
      name: v.name.trim(),
      price: Math.max(0, Math.round(v.price)),
      stock: v.stock == null ? null : Math.max(0, Math.round(v.stock)),
    }))
    .filter((v) => v.name.length > 0)
    .slice(0, 20);
  // Try with stock; fall back to without (stock column not migrated yet).
  try {
    await tenantDb(restaurantId, async (tx) => {
      const item = await tx.menuItem.findFirst({ where: { id: menuItemId }, select: { id: true } });
      if (!item) return;
      await tx.menuItemVariant.deleteMany({ where: { menuItemId } });
      if (clean.length > 0) {
        await tx.menuItemVariant.createMany({
          data: clean.map((v, i) => ({ restaurantId, menuItemId, name: v.name, price: v.price, stock: v.stock, sortOrder: i })),
        });
      }
    });
    return;
  } catch {
    /* fall through: maybe the stock column isn't migrated */
  }
  try {
    await tenantDb(restaurantId, async (tx) => {
      const item = await tx.menuItem.findFirst({ where: { id: menuItemId }, select: { id: true } });
      if (!item) return;
      await tx.menuItemVariant.deleteMany({ where: { menuItemId } });
      if (clean.length > 0) {
        await tx.menuItemVariant.createMany({
          data: clean.map((v, i) => ({ restaurantId, menuItemId, name: v.name, price: v.price, sortOrder: i })),
        });
      }
    });
  } catch {
    /* variants table not migrated yet — ignore */
  }
}

/**
 * Decrement per-size stock as orders are placed (only sizes that track stock).
 * Floors at 0 so a size auto-marks sold out. Best-effort, own tenant tx so it
 * never poisons the order that was just created.
 */
export async function recordVariantsSold(
  restaurantId: string,
  lines: { variantId: string; quantity: number }[],
): Promise<void> {
  const byVariant = new Map<string, number>();
  for (const l of lines) {
    if (!l.variantId) continue;
    byVariant.set(l.variantId, (byVariant.get(l.variantId) ?? 0) + l.quantity);
  }
  if (byVariant.size === 0) return;
  try {
    await tenantDb(restaurantId, async (tx) => {
      for (const [variantId, qty] of byVariant) {
        await tx.$executeRaw`
          UPDATE "menu_item_variants"
          SET "stock" = GREATEST(0, "stock" - ${qty})
          WHERE "id" = ${variantId} AND "stock" IS NOT NULL`;
      }
    });
  } catch {
    /* stock column not migrated yet — ignore */
  }
}
