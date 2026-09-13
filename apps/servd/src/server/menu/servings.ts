import "server-only";

import { tenantDb } from "@/server/tenancy/scoped-db";
import { manilaDayKey } from "@/lib/time/manila";

/**
 * Per-item daily servings cap. An admin sets how many servings of a menu item
 * are available per day; once that many are sold the item shows as sold out for
 * the rest of the (Manila) day, then the count resets at midnight.
 *
 * All helpers are best-effort: if the `menu_item_servings` table hasn't been
 * migrated yet they no-op / report "unlimited" so ordering never hard-fails.
 */

export interface ServingState {
  dailyLimit: number | null; // null = unlimited (no cap)
  remaining: number | null; // null = unlimited; otherwise >= 0
}

function remainingOf(
  row: { dailyLimit: number | null; soldToday: number; soldOn: string | null },
  today: string,
): number | null {
  if (row.dailyLimit == null) return null;
  const sold = row.soldOn === today ? row.soldToday : 0; // fresh day → 0
  return Math.max(0, row.dailyLimit - sold);
}

/** Serving state per item (only items with a configured cap appear). Best-effort. */
export async function getServingStates(
  restaurantId: string,
  itemIds?: string[],
): Promise<Map<string, ServingState>> {
  const today = manilaDayKey(new Date());
  const map = new Map<string, ServingState>();
  if (itemIds && itemIds.length === 0) return map;
  try {
    const rows = await tenantDb(restaurantId, (tx) =>
      tx.menuItemServing.findMany({
        where: itemIds ? { menuItemId: { in: itemIds } } : {},
        select: { menuItemId: true, dailyLimit: true, soldToday: true, soldOn: true },
      }),
    );
    for (const r of rows) {
      if (r.dailyLimit == null) continue; // no cap configured
      map.set(r.menuItemId, { dailyLimit: r.dailyLimit, remaining: remainingOf(r, today) });
    }
  } catch {
    /* menu_item_servings not migrated yet — treat everything as unlimited */
  }
  return map;
}

/**
 * Set (or clear, with null) a menu item's daily servings limit.
 *
 * Reports a failure rather than swallowing it. This is the field next to the
 * food cost, and it had the identical silent catch — an owner typing a cap,
 * saving, and finding it gone would have had no more explanation than the
 * food-cost bug gave them. A refused write must say so.
 */
export async function setDailyLimit(
  restaurantId: string,
  menuItemId: string,
  limit: number | null,
): Promise<string | null> {
  const today = manilaDayKey(new Date());
  try {
    await tenantDb(restaurantId, (tx) =>
      tx.menuItemServing.upsert({
        where: { menuItemId },
        create: { menuItemId, restaurantId, dailyLimit: limit, soldToday: 0, soldOn: today },
        update: { dailyLimit: limit },
      }),
    );
    return null;
  } catch (e) {
    console.error("setDailyLimit failed", e);
    return "Everything else saved, but the daily limit couldn't be. Run prisma/manual/fix-table-grants.sql, then try again.";
  }
}

/**
 * Count sold servings toward each item's daily cap. Runs in its own tenant tx so
 * a failure (e.g. table not migrated) can never poison the order that was just
 * placed. Only items that already have a configured row are counted; the count
 * resets when the Manila day rolls over.
 */
export async function recordServingsSold(
  restaurantId: string,
  lines: { menuItemId: string; quantity: number }[],
): Promise<void> {
  const byItem = new Map<string, number>();
  for (const l of lines) byItem.set(l.menuItemId, (byItem.get(l.menuItemId) ?? 0) + l.quantity);
  if (byItem.size === 0) return;

  const today = manilaDayKey(new Date());
  try {
    await tenantDb(restaurantId, async (tx) => {
      for (const [menuItemId, qty] of byItem) {
        await tx.$executeRaw`
          UPDATE "menu_item_servings"
          SET "soldToday" = CASE WHEN "soldOn" = ${today} THEN "soldToday" + ${qty} ELSE ${qty} END,
              "soldOn" = ${today},
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE "menuItemId" = ${menuItemId}`;
      }
    });
  } catch {
    /* not migrated yet — ignore */
  }
}
