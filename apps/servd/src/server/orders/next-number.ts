import "server-only";

import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { startOfManilaDay } from "@/lib/orders/order-number";

/**
 * The next daily ticket number.
 *
 * What a customer is called when there's no table to call them by — a counter
 * queue, a stall, or a dine-in shop that takes the order at the till and seats
 * people afterwards. Resets at Manila midnight, so tomorrow starts at 1 again.
 *
 * Computed inside the caller's transaction, never on the client: two tills
 * ringing up at the same moment must not hand out the same number.
 *
 * Worth knowing: this is last-number-plus-one, so a voided ticket leaves its
 * number used rather than recycling it. That's deliberate — a number that comes
 * back around means two different orders answered to "27" in one service.
 */
export async function nextOrderNumber(
  tx: Prisma.TransactionClient,
  now: Date = new Date(),
): Promise<number> {
  const last = await tx.order.findFirst({
    where: { orderNumber: { not: null }, createdAt: { gte: startOfManilaDay(now) } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  return (last?.orderNumber ?? 0) + 1;
}

/**
 * The next ticket number, resolved on its own and best-effort.
 *
 * Deliberately NOT called from inside the order's transaction. `orderNumber`
 * ships in a hand-run migration, and in Postgres one failed statement aborts
 * the whole transaction — so a shop that hasn't run it would lose the order
 * itself, not just its number. Null here means "carry on without one": the
 * ticket is still taken, it just shows a dash until the migration lands.
 */
export async function nextOrderNumberSafe(restaurantId: string): Promise<number | null> {
  try {
    return await tenantDb(restaurantId, (tx) => nextOrderNumber(tx));
  } catch {
    return null;
  }
}
