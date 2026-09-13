import { tenantDb } from "@/server/tenancy/scoped-db";

/**
 * Read helpers for the admin menu screens. All are tenant-scoped: they run
 * inside tenantDb(restaurantId), so RLS guarantees only this restaurant's rows
 * come back even though the queries themselves don't repeat the filter.
 */

/** Categories (sorted) each with their items (sorted). */
export function getMenu(restaurantId: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        menuItems: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    }),
  );
}

/** Flat list of categories, for select inputs. */
export function getCategories(restaurantId: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.category.findMany({ orderBy: { sortOrder: "asc" } }),
  );
}

/**
 * A single item with the modifier groups attached to it.
 *
 * Group columns are listed explicitly: `sortOrder` arrives in a manual
 * migration, and `include: { group: true }` would select it and break the
 * whole item editor on a database that hasn't run the file.
 */
export function getItem(restaurantId: string, itemId: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.menuItem.findFirst({
      where: { id: itemId },
      include: {
        modifierGroups: {
          include: {
            group: {
              select: {
                id: true,
                name: true,
                required: true,
                minSelect: true,
                maxSelect: true,
              },
            },
          },
        },
      },
    }),
  );
}

/**
 * All modifier groups for the restaurant, with their options, in the order the
 * owner arranged them.
 *
 * `sortOrder` ships in a manual migration (add-modifier-group-order.sql), so
 * the ordered query is tried first and falls back to creation order — which is
 * what the page showed before the column existed. A Modifiers page that won't
 * load is far worse than one listing groups in their old order.
 */
const MODIFIER_GROUP_FIELDS = {
  id: true,
  name: true,
  required: true,
  minSelect: true,
  maxSelect: true,
  createdAt: true,
  // Explicit columns: `isAvailable` on a modifier also ships in a manual
  // migration, so it's read separately rather than through a wide include.
  modifiers: {
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, priceDelta: true },
  },
} as const;

export async function getModifierGroups(restaurantId: string) {
  try {
    return await tenantDb(restaurantId, (tx) =>
      tx.modifierGroup.findMany({
        // Ties break on createdAt so a group with no order keeps its old
        // position rather than jumping — NULLs sort last in Postgres ascending.
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { ...MODIFIER_GROUP_FIELDS, sortOrder: true },
      }),
    );
  } catch {
    const rows = await tenantDb(restaurantId, (tx) =>
      tx.modifierGroup.findMany({
        orderBy: { createdAt: "asc" },
        select: MODIFIER_GROUP_FIELDS,
      }),
    );
    return rows.map((r) => ({ ...r, sortOrder: null as number | null }));
  }
}
