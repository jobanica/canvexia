import "server-only";

import { systemDb, tenantDb } from "@/server/tenancy/scoped-db";

/**
 * "86-ing" a single add-on: a modifier option can be marked out when the
 * kitchen runs out of it, without deleting it from the group.
 *
 * `Modifier.isAvailable` ships in a manual migration, so every read here is
 * best-effort — on a database that hasn't run it yet we return "nothing is
 * marked out" instead of blowing up the whole menu. For the same reason callers
 * must NOT pull the column through a wide `include`; they select the stable
 * columns and layer this on top.
 */

/** Ids of the modifiers currently marked out for a restaurant. */
export async function getUnavailableModifierIds(restaurantId: string): Promise<Set<string>> {
  try {
    const rows = await systemDb((tx) =>
      tx.modifier.findMany({
        where: { isAvailable: false, group: { restaurantId } },
        select: { id: true },
      }),
    );
    return new Set(rows.map((r) => r.id));
  } catch {
    return new Set(); // column not migrated yet → everything is available
  }
}

/** Availability flag per modifier id, for the admin list. */
export async function getModifierAvailability(
  restaurantId: string,
): Promise<Map<string, boolean>> {
  try {
    const rows = await tenantDb(restaurantId, (tx) =>
      tx.modifier.findMany({
        where: { group: { restaurantId } },
        select: { id: true, isAvailable: true },
      }),
    );
    return new Map(rows.map((r) => [r.id, r.isAvailable]));
  } catch {
    return new Map();
  }
}
