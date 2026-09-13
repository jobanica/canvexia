"use server";

import { systemDb } from "@/server/tenancy/scoped-db";
import { visibleRiderTracking } from "@/lib/orders/rider-tracking";
import { notifyOrdersChanged } from "@/server/realtime/notify";
import { ensureSettlementPayment } from "@/server/orders/settle-payment";

export type CancelResult = { ok: true } | { ok: false; error: string };

/**
 * Lets the customer cancel their OWN online order — but only while it's still
 * pending (not yet accepted by the restaurant). Authorized by slug + orderId
 * (the unguessable UUID). Once accepted, the update matches no rows and we tell
 * them it can't be cancelled anymore.
 */
export async function cancelWebOrder(slug: string, orderId: string): Promise<CancelResult> {
  if (!slug || !orderId) return { ok: false, error: "Order not found." };
  const restaurant = await systemDb((tx) => tx.restaurant.findFirst({ where: { slug }, select: { id: true } }));
  if (!restaurant) return { ok: false, error: "Order not found." };

  const res = await systemDb((tx) =>
    tx.order.updateMany({
      where: { id: orderId, restaurantId: restaurant.id, status: "pending" },
      data: { status: "cancelled", cancelReason: "Cancelled by customer" },
    }),
  );
  if (res.count === 0) {
    return { ok: false, error: "This order was already accepted and can no longer be cancelled." };
  }
  await notifyOrdersChanged(restaurant.id);
  return { ok: true };
}

/**
 * Lets the customer confirm their delivery ARRIVED — only valid while the order
 * is out for delivery. Authorized by slug + orderId (unguessable UUID). Closes
 * the order as delivered + paid and records the settlement, so the merchant app
 * marks it delivered automatically (via the realtime refresh).
 */
export async function customerMarkDelivered(slug: string, orderId: string): Promise<CancelResult> {
  if (!slug || !orderId) return { ok: false, error: "Order not found." };
  const restaurant = await systemDb((tx) => tx.restaurant.findFirst({ where: { slug }, select: { id: true } }));
  if (!restaurant) return { ok: false, error: "Order not found." };

  let count = 0;
  try {
    count = await systemDb(async (tx) => {
      const res = await tx.order.updateMany({
        where: { id: orderId, restaurantId: restaurant.id, deliveryStatus: "out_for_delivery" },
        data: { deliveryStatus: "delivered", status: "closed", paymentStatus: "paid", billRequested: false },
      });
      if (res.count > 0) await ensureSettlementPayment(tx, orderId);
      return res.count;
    });
  } catch {
    return { ok: false, error: "We couldn't update your order. Please try again." };
  }
  if (count === 0) return { ok: false, error: "This order isn't out for delivery yet." };
  await notifyOrdersChanged(restaurant.id);
  return { ok: true };
}

/**
 * Public order-status lookup for an ONLINE (web storefront) order. The customer
 * has no session and no table token — access is authorized by the restaurant
 * slug + the order id together. The order id is an unguessable UUID and the
 * order must belong to that restaurant, so this is safe to expose publicly.
 *
 * Mirrors getOrderStatus (the table-diner tracker) but keyed by slug + orderId
 * instead of a table token, and also surfaces the delivery sub-status so the
 * customer sees "Out for delivery" / "Delivered".
 */
export interface WebOrderStatusResult {
  restaurantId: string; // so the client can subscribe to the realtime channel
  status: string; // pending | new | preparing | done | closed | cancelled
  paymentStatus: string;
  deliveryStatus: string | null; // null | out_for_delivery | delivered
  orderType: string; // takeout | delivery (online orders)
  total: number; // centavos
  orderNumber: number | null; // daily ticket number, if any
  prepMinutes: number | null; // ETA the merchant set on accept, if any
  /**
   * Where the diner can watch the rider, when the provider gives us one.
   *
   * Only an API provider returns a tracking URL — a manual booking is a phone
   * call and a deep-link booking happens inside somebody else's app, and
   * neither has a page to send anyone to. Null is the normal case, not a
   * failure, so the tracker simply shows nothing.
   */
  riderTrackingUrl: string | null;
  riderName: string | null;
  /**
   * When the rider said they were at the door.
   *
   * Not a delivery status: it happens *during* "out for delivery" and the
   * delivery is not finished until somebody hands the food across. The tracker
   * shows it as a banner over the current stage rather than as a new stage.
   */
  riderArrivedAt: string | null;
  /** The last thing the rider said, so the tracker can announce it. */
  riderMessageAt: string | null;
  riderMessage: string | null;
}

export async function getWebOrderStatus(
  slug: string,
  orderId: string,
): Promise<WebOrderStatusResult | null> {
  if (!slug || !orderId) return null;
  return systemDb(async (tx) => {
    const restaurant = await tx.restaurant.findFirst({
      where: { slug },
      select: { id: true },
    });
    if (!restaurant) return null;

    // Core fields always exist; the order must belong to this restaurant.
    const order = await tx.order.findFirst({
      where: { id: orderId, restaurantId: restaurant.id },
      select: { status: true, paymentStatus: true, total: true, discountAmount: true },
    });
    if (!order) return null;
    // Show the net amount the customer actually pays (after any coupon).
    const netTotal = Math.max(0, order.total - (order.discountAmount ?? 0));

    // orderType / deliveryStatus / prepMinutes columns may lag on prod — read
    // them best-effort so the tracker never breaks before a migration runs.
    // Web orders are collected, not counter takeout — see lib/orders/order-type.
    let orderType = "pickup";
    let deliveryStatus: string | null = null;
    try {
      const extra = await tx.order.findFirst({
        where: { id: orderId },
        select: { orderType: true, deliveryStatus: true },
      });
      orderType = extra?.orderType ?? "pickup";
      deliveryStatus = extra?.deliveryStatus ?? null;
    } catch {
      /* columns not migrated yet */
    }

    let prepMinutes: number | null = null;
    try {
      const p = await tx.order.findFirst({ where: { id: orderId }, select: { prepMinutes: true } });
      prepMinutes = p?.prepMinutes ?? null;
    } catch {
      /* prepMinutes not migrated yet */
    }

    let orderNumber: number | null = null;
    try {
      const n = await tx.order.findFirst({ where: { id: orderId }, select: { orderNumber: true } });
      orderNumber = n?.orderNumber ?? null;
    } catch {
      /* column not migrated yet */
    }

    // The booking is best-effort like the columns above: a restaurant with no
    // delivery integration has no row here, and the tracker must not break for
    // one that never will.
    let rider = { riderTrackingUrl: null as string | null, riderName: null as string | null };
    let riderArrivedAt: string | null = null;
    let riderMessageAt: string | null = null;
    let riderMessage: string | null = null;
    try {
      const booking = await tx.deliveryBooking.findFirst({
        where: { orderId, restaurantId: restaurant.id },
        select: { trackingUrl: true, riderName: true, status: true },
        orderBy: { createdAt: "desc" },
      });
      rider = visibleRiderTracking(booking);

      // The arrival and the last message are read separately, and are allowed
      // to fail on their own: these three columns are newer than the rest, and
      // asking for them in the query above would mean a database that has not
      // had them added yet loses the rider link it has always had.
      //
      // Both follow that link's rule anyway — a diner who may not see the rider
      // may not see what the rider said either.
      if (rider.riderTrackingUrl) {
        try {
          const said = await tx.deliveryBooking.findFirst({
            where: { orderId, restaurantId: restaurant.id },
            select: { arrivedAt: true, lastMessageAt: true, lastMessageBody: true },
            orderBy: { createdAt: "desc" },
          });
          riderArrivedAt = said?.arrivedAt?.toISOString() ?? null;
          riderMessageAt = said?.lastMessageAt?.toISOString() ?? null;
          riderMessage = said?.lastMessageBody ?? null;
        } catch {
          /* arrival columns not migrated here */
        }
      }
    } catch {
      /* delivery_bookings not migrated here */
    }

    return {
      restaurantId: restaurant.id,
      status: order.status,
      paymentStatus: order.paymentStatus,
      deliveryStatus,
      orderType,
      total: netTotal,
      orderNumber,
      prepMinutes,
      riderTrackingUrl: rider.riderTrackingUrl,
      riderName: rider.riderName,
      riderArrivedAt,
      riderMessageAt,
      riderMessage,
    };
  });
}
