import "server-only";

import { getSmsProvider } from "@/server/sms";
import { tenantDb } from "@/server/tenancy/scoped-db";

/**
 * Best-effort transactional SMS to a customer. Sends only if the platform SMS
 * provider (SEMAPHORE_API_KEY) is configured; uses the restaurant's registered
 * sender name. Never throws into the order flow.
 */
export async function notifyCustomer(
  restaurantId: string,
  phone: string | null | undefined,
  message: string,
): Promise<void> {
  if (!phone) return;
  try {
    const provider = getSmsProvider();
    if (!provider) return;
    const r = await tenantDb(restaurantId, (tx) =>
      tx.restaurant.findFirstOrThrow({ select: { smsSenderName: true } }),
    );
    await provider.send(r.smsSenderName || "Servd", phone, message);
  } catch {
    /* SMS is best-effort */
  }
}

/** The display name to put in customer messages. */
export async function restaurantDisplayName(restaurantId: string): Promise<string> {
  try {
    const r = await tenantDb(restaurantId, (tx) =>
      tx.restaurant.findFirstOrThrow({ select: { name: true, displayName: true } }),
    );
    return r.displayName || r.name;
  } catch {
    return "the restaurant";
  }
}
