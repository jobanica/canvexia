import { NextRequest } from "next/server";
import { systemDb } from "@/server/tenancy/scoped-db";
import { resolveProvider } from "@/server/delivery/provider";
import { notifyOrdersChanged } from "@/server/realtime/notify";
import { sendDinerPush } from "@/server/push/send";

/**
 * Inbound delivery-status webhook for API providers. Mirrors the PayMongo
 * webhook: read the RAW body, verify the signature with THIS restaurant's stored
 * webhook secret (inside the provider adapter), then update the matching booking
 * + order and ping realtime. Always 200 for handled events so the provider
 * doesn't retry forever; 400 only on a bad signature.
 *
 * Configure each restaurant's provider webhook to:
 *   {APP_URL}/api/webhooks/delivery/{restaurantId}
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const rawBody = await req.text();

  const resolved = await resolveProvider(restaurantId);
  if (resolved.mode !== "api" || !resolved.provider.verifyWebhook) {
    return new Response("Not configured", { status: 404 });
  }

  const update = resolved.provider.verifyWebhook(rawBody, req.headers);
  if (!update) return new Response("Invalid signature", { status: 400 });

  const matched = await systemDb(async (tx) => {
    const booking = await tx.deliveryBooking.findFirst({
      where: { restaurantId, bookingRef: update.bookingRef },
      select: { orderId: true },
    });
    if (!booking) return null;

    await tx.deliveryBooking.updateMany({
      where: { restaurantId, bookingRef: update.bookingRef },
      data: {
        status: update.status,
        riderName: update.riderName ?? undefined,
        riderPhone: update.riderPhone ?? undefined,
        riderLat: update.riderLat ?? undefined,
        riderLng: update.riderLng ?? undefined,
        trackingUrl: update.trackingUrl ?? undefined,
        etaMinutes: update.etaMinutes ?? undefined,
      },
    });

    // Mirror onto the order so the customer's live tracker + boards reflect it.
    if (update.status === "picked_up") {
      await tx.order.updateMany({ where: { id: booking.orderId }, data: { deliveryStatus: "out_for_delivery" } });
    } else if (update.status === "delivered") {
      await tx.order.updateMany({
        where: { id: booking.orderId },
        data: { deliveryStatus: "delivered", status: "closed", paymentStatus: "paid", billRequested: false },
      });
    }
    return booking.orderId;
  }).catch(() => null);

  if (matched) {
    await notifyOrdersChanged(restaurantId);
    const wasArrived = await recordArrivalAndMessage(restaurantId, update);
    await tellTheDiner(restaurantId, matched, wasArrived, update);
  }
  return new Response("ok", { status: 200 });
}

/**
 * Arrival and the last message, written apart from everything above.
 *
 * Deliberately its own transaction, and deliberately allowed to fail. These
 * three columns are new; a deployment that reaches production before the SQL
 * in prisma/manual does would otherwise take the whole callback down with them
 * — and that callback is what marks an order out-for-delivery and delivered.
 * A missing doorbell is worth nothing next to an order that never closes.
 *
 * Returns whether this booking had already arrived before now, so a retried
 * callback does not ring the diner's phone twice.
 */
async function recordArrivalAndMessage(
  restaurantId: string,
  update: {
    bookingRef: string;
    arrivedAt?: string | null;
    message?: { from: string; body: string | null; at: string | null } | null;
  },
): Promise<boolean> {
  const rider = update.message?.from === "rider" ? update.message : null;
  if (!update.arrivedAt && !rider) return false;

  try {
    return await systemDb(async (tx) => {
      const before = await tx.deliveryBooking.findFirst({
        where: { restaurantId, bookingRef: update.bookingRef },
        select: { arrivedAt: true },
      });
      await tx.deliveryBooking.updateMany({
        where: { restaurantId, bookingRef: update.bookingRef },
        data: {
          arrivedAt: update.arrivedAt ? new Date(update.arrivedAt) : undefined,
          // Only the rider's side is kept. What the diner typed they already have.
          lastMessageAt: rider?.at ? new Date(rider.at) : undefined,
          lastMessageBody: rider ? rider.body ?? undefined : undefined,
        },
      });
      return Boolean(before?.arrivedAt);
    });
  } catch {
    // Columns not migrated here yet. Say "already arrived" so nothing is
    // announced from a state we could not read.
    return true;
  }
}

/**
 * The two moments worth waking a phone for.
 *
 * Everything else on this order the diner can find by looking at the tracker;
 * these two are the ones where somebody is waiting on *them*. Best-effort by
 * design — a push that fails must not turn a delivered order into a 500 and a
 * provider retry.
 */
async function tellTheDiner(
  restaurantId: string,
  orderId: string,
  wasArrived: boolean,
  update: { arrivedAt?: string | null; message?: { from: string; body: string | null } | null },
): Promise<void> {
  const url = await dinerTrackerUrl(restaurantId, orderId);
  try {
    if (update.arrivedAt && !wasArrived) {
      await sendDinerPush(orderId, {
        title: "Your rider is outside 🛵",
        body: "They are at your address with your order.",
        url,
        tag: `arrived-${orderId}`,
      });
    }
    if (update.message?.from === "rider" && update.message.body) {
      await sendDinerPush(orderId, {
        title: "Message from your rider 💬",
        body: update.message.body.slice(0, 140),
        url,
        tag: `chat-${orderId}`,
      });
    }
  } catch {
    /* the tracker still updates on its own */
  }
}

/** Where the diner's own order lives, for the notification to open. */
async function dinerTrackerUrl(restaurantId: string, orderId: string): Promise<string> {
  try {
    const r = await systemDb((tx) =>
      tx.restaurant.findFirst({ where: { id: restaurantId }, select: { slug: true } }),
    );
    return r?.slug ? `/r/${r.slug}/order/${orderId}` : "/";
  } catch {
    return "/";
  }
}
