import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * The items only the counter can see.
 *
 * Read as a separate best-effort query rather than as a `where` clause on the
 * menu itself, and that's deliberate: `posOnly` ships as a hand-run migration,
 * and filtering on a column the database doesn't have yet would take down the
 * entire storefront menu rather than one hidden item. An empty set means
 * "nothing is hidden", which is exactly how every restaurant behaved before
 * this existed.
 */
export async function getPosOnlyItemIds(restaurantId: string): Promise<Set<string>> {
  try {
    const rows = await systemDb((tx) =>
      tx.menuItem.findMany({
        where: { restaurantId, posOnly: true },
        select: { id: true },
      }),
    );
    return new Set(rows.map((r) => r.id));
  } catch {
    return new Set();
  }
}
