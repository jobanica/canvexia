import "server-only";

import { tenantDb } from "@/server/tenancy/scoped-db";

/**
 * The order set on the Modifiers page, as a lookup.
 *
 * Read on its own, exactly like modifier availability, because `sortOrder`
 * arrives in a manual migration (add-modifier-group-order.sql). Selecting it
 * alongside the menu would mean a database that hasn't run the file yet can't
 * load a menu at all — and a menu that doesn't load is a much worse failure
 * than one whose option groups are in the old arbitrary order.
 *
 * An empty map means "no stored order", and everything falls back to name.
 */
export async function getModifierGroupOrder(
  restaurantId: string,
): Promise<Map<string, number>> {
  try {
    const rows = await tenantDb(restaurantId, (tx) =>
      tx.modifierGroup.findMany({ select: { id: true, sortOrder: true } }),
    );
    const out = new Map<string, number>();
    for (const r of rows) if (r.sortOrder != null) out.set(r.id, r.sortOrder);
    return out;
  } catch {
    return new Map();
  }
}
