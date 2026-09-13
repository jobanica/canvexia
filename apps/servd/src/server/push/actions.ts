"use server";

import { z } from "zod";
import { requireStaff } from "@/server/tenancy/current-user";
import { tenantDb, systemDb } from "@/server/tenancy/scoped-db";

const MERCHANT_ROLES = ["merchant", "cashier", "admin", "manager"] as const;

const schema = z.object({
  endpoint: z.string().url().max(1000),
  p256dh: z.string().min(1).max(500),
  auth: z.string().min(1).max(500),
});

export type PushSubInput = z.infer<typeof schema>;

/**
 * Stores (or refreshes) a merchant device's Web Push subscription so new online
 * orders can alert it in the background. Keyed by endpoint so re-subscribing the
 * same device updates in place.
 */
export async function savePushSubscription(input: PushSubInput): Promise<{ ok: boolean }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false };
  let staff;
  try {
    staff = await requireStaff([...MERCHANT_ROLES]);
  } catch {
    return { ok: false };
  }
  try {
    await tenantDb(staff.restaurantId, (tx) =>
      tx.pushSubscription.upsert({
        where: { endpoint: parsed.data.endpoint },
        create: { restaurantId: staff.restaurantId, ...parsed.data },
        update: { restaurantId: staff.restaurantId, p256dh: parsed.data.p256dh, auth: parsed.data.auth },
        select: { id: true },
      }),
    );
    return { ok: true };
  } catch {
    return { ok: false }; // table not migrated yet
  }
}

const dinerSchema = schema.extend({
  slug: z.string().min(1).max(200),
  orderId: z.string().uuid(),
});

/**
 * Stores a diner's Web Push subscription against their own order.
 *
 * Authorized the way every other public order action here is: the restaurant
 * slug plus the order's unguessable UUID, together. There is no session to
 * check — a diner ordering from a phone has no account — so the order id is the
 * credential, and it only ever subscribes the device to that one order.
 */
export async function saveDinerPushSubscription(
  input: z.infer<typeof dinerSchema>,
): Promise<{ ok: boolean }> {
  const parsed = dinerSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const { slug, orderId, endpoint, p256dh, auth } = parsed.data;

  try {
    const restaurant = await systemDb((tx) => tx.restaurant.findFirst({ where: { slug }, select: { id: true } }));
    if (!restaurant) return { ok: false };

    const order = await systemDb((tx) =>
      tx.order.findFirst({ where: { id: orderId, restaurantId: restaurant.id }, select: { id: true } }),
    );
    if (!order) return { ok: false };

    // restaurantId is deliberately left alone on an existing row. One endpoint
    // is one device, and that device may already be a merchant's till: taking
    // its restaurantId over because the owner ordered lunch somewhere else
    // would move their new-order alarm to the other restaurant. Merchant sends
    // match on restaurantId and diner sends on orderId, so one row can serve
    // both without either noticing.
    await systemDb((tx) =>
      tx.pushSubscription.upsert({
        where: { endpoint },
        create: { restaurantId: restaurant.id, orderId, endpoint, p256dh, auth },
        update: { orderId, p256dh, auth },
        select: { id: true },
      }),
    );
    return { ok: true };
  } catch {
    return { ok: false }; // column not migrated yet
  }
}
