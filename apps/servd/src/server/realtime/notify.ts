import "server-only";

/**
 * Fire-and-forget realtime signal that a restaurant's orders changed.
 *
 * We DON'T stream row data over realtime (that would need per-restaurant JWT
 * claims to satisfy RLS). Instead we broadcast a contentless "refresh" ping on a
 * per-restaurant channel; the kitchen/cashier clients react by refetching
 * through our session-scoped server actions, which are the trusted data path.
 *
 * Uses the Supabase Realtime broadcast REST endpoint with the service-role key.
 * Best-effort: failures never block the order write (clients also poll).
 */
export function ordersChannel(restaurantId: string): string {
  return `orders-${restaurantId}`;
}

/** Fire-and-forget broadcast of an event on a restaurant's orders channel. */
async function broadcast(
  restaurantId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return; // not configured (e.g. local without Supabase)

  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [{ topic: ordersChannel(restaurantId), event, payload }],
      }),
    });
  } catch {
    // ignore — best-effort
  }
}

export async function notifyOrdersChanged(restaurantId: string): Promise<void> {
  await broadcast(restaurantId, "refresh", {});
}

/** Alert staff screens that a table is calling for a waiter. */
export async function notifyWaiterCall(
  restaurantId: string,
  tableNumber: string,
): Promise<void> {
  await broadcast(restaurantId, "waiter", { tableNumber, at: Date.now() });
}

/**
 * Alert staff that a table requested the bill. "cash" = a waiter must collect;
 * "gcash_qr" = a waiter must bring the printed GCash QR to the table.
 */
export async function notifyBillRequest(
  restaurantId: string,
  tableNumber: string,
  method: "cash" | "online" | "gcash_qr",
): Promise<void> {
  await broadcast(restaurantId, "bill", { tableNumber, method, at: Date.now() });
}
