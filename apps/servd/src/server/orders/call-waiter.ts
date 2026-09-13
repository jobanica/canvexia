"use server";

import { systemDb } from "@/server/tenancy/scoped-db";
import { notifyWaiterCall } from "@/server/realtime/notify";

/**
 * A diner taps "Call waiter" — alert the staff screens in real time. No session
 * (authorized by the table token), and no DB write: it's a transient live ping
 * the cashier acknowledges on screen.
 */
export async function callWaiter(input: {
  slug: string;
  tableToken: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { slug, tableToken } = input;
  if (!slug || !tableToken) return { ok: false, error: "Invalid request." };

  const ctx = await systemDb(async (tx) => {
    const restaurant = await tx.restaurant.findFirst({ where: { slug }, select: { id: true } });
    if (!restaurant) return null;
    const table = await tx.table.findFirst({
      where: { restaurantId: restaurant.id, qrToken: tableToken },
      select: { tableNumber: true },
    });
    if (!table) return null;
    return { restaurantId: restaurant.id, tableNumber: table.tableNumber };
  });
  if (!ctx) return { ok: false, error: "This table is unavailable." };

  await notifyWaiterCall(ctx.restaurantId, ctx.tableNumber);
  return { ok: true };
}
