import "server-only";

import { tenantDb } from "@/server/tenancy/scoped-db";

/** Map of menuItemId → food cost (centavos). Resilient if the table lags. */
export async function getMenuCostMap(restaurantId: string): Promise<Map<string, number>> {
  try {
    const rows = await tenantDb(restaurantId, (tx) =>
      tx.menuItemCost.findMany({ where: { restaurantId }, select: { menuItemId: true, cost: true } }),
    );
    return new Map(rows.map((r) => [r.menuItemId, r.cost]));
  } catch {
    return new Map();
  }
}

/** A single item's food cost (centavos), or 0. */
export async function getMenuItemCost(restaurantId: string, menuItemId: string): Promise<number> {
  try {
    const row = await tenantDb(restaurantId, (tx) =>
      tx.menuItemCost.findFirst({ where: { menuItemId }, select: { cost: true } }),
    );
    return row?.cost ?? 0;
  } catch {
    return 0;
  }
}
