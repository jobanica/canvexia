"use server";

import { systemDb, tenantDb } from "@/server/tenancy/scoped-db";
import {
  placeOrderSchema,
  type PlaceOrderInput,
  type PlaceOrderResult,
} from "@/lib/validation/order";
import { notifyOrdersChanged } from "@/server/realtime/notify";
import {
  buildValidatedOrder,
  orderItemsCreate,
  OrderValidationError,
} from "@/server/orders/build-order";
import { resolvePromo } from "@/server/promotions/redeem";
import { recordServingsSold } from "@/server/menu/servings";
import { recordVariantsSold } from "@/server/menu/variants";
import { startOfManilaDay } from "@/lib/orders/order-number";

/**
 * Creates an order from a diner's cart. Diners have no session — the order is
 * authorized purely by the table token in the URL.
 *
 * The order is created as `pending`: it does NOT go to the kitchen until a
 * cashier accepts it (the cashier sees an incoming-order popup). Pricing and
 * validation are recomputed server-side via buildValidatedOrder — the client is
 * never trusted for money.
 */
export async function placeOrder(
  input: PlaceOrderInput,
): Promise<PlaceOrderResult> {
  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid order" };
  }
  const { slug, tableToken, lines, loyaltyPhone, couponCode } = parsed.data;

  // Resolve the restaurant + table (public lookups, scoped by slug/token).
  const ctx = await systemDb(async (tx) => {
    const restaurant = await tx.restaurant.findFirst({
      where: { slug, status: "active" },
      select: { id: true },
    });
    if (!restaurant) return null;
    const table = await tx.table.findFirst({
      where: { restaurantId: restaurant.id, qrToken: tableToken },
      select: { id: true },
    });
    if (!table) return null;
    // isCounter may not exist yet on a lagging DB — read it best-effort.
    let isCounter = false;
    try {
      const c = await tx.table.findFirst({ where: { id: table.id }, select: { isCounter: true } });
      isCounter = c?.isCounter ?? false;
    } catch {
      /* column not migrated yet */
    }
    return { restaurantId: restaurant.id, tableId: table.id, isCounter };
  });
  if (!ctx) return { ok: false, error: "This table or restaurant is unavailable." };

  let built;
  try {
    built = await buildValidatedOrder(ctx.restaurantId, lines);
  } catch (e) {
    if (e instanceof OrderValidationError) return { ok: false, error: e.message };
    return { ok: false, error: "We couldn't place your order. Please try again." };
  }

  // Apply a coupon code if given — recomputed server-side, never trusted.
  let discount: { amount: number; label: string } | null = null;
  if (couponCode?.trim()) {
    const resolved = await resolvePromo(ctx.restaurantId, couponCode, built, 0);
    if (resolved) discount = { amount: resolved.amount, label: resolved.label };
  }

  // Persist atomically, tenant-scoped (RLS WITH CHECK enforces the boundary).
  // Counter/stall orders are takeout and carry a daily-reset order number.
  const baseData = {
    restaurantId: ctx.restaurantId,
    tableId: ctx.tableId,
    status: "pending" as const, // awaiting cashier acceptance
    paymentStatus: "unpaid" as const,
    total: built.total,
    ...(ctx.isCounter ? { orderType: "takeout" as const } : {}),
    ...(discount ? { discountAmount: discount.amount, discountLabel: discount.label } : {}),
    items: { create: orderItemsCreate(built.items) },
  };
  const phone = loyaltyPhone?.trim() || null;

  let order!: { id: string; orderNumber?: number | null };
  try {
    order = await tenantDb(ctx.restaurantId, async (tx) => {
      // Next daily ticket number for a counter order (server-computed).
      let orderNumber: number | null = null;
      if (ctx.isCounter) {
        const last = await tx.order.findFirst({
          where: { orderNumber: { not: null }, createdAt: { gte: startOfManilaDay() } },
          orderBy: { orderNumber: "desc" },
          select: { orderNumber: true },
        });
        orderNumber = (last?.orderNumber ?? 0) + 1;
      }
      return tx.order.create({
        data: {
          ...baseData,
          // QR dine-in/counter order — counts toward the monthly cap (with
          // online). In `data` (not baseData) so the lagging-schema fallback
          // below retries without it.
          source: "qr",
          ...(phone ? { customerPhone: phone } : {}),
          ...(orderNumber != null ? { orderNumber } : {}),
        },
        select: { id: true, orderNumber: true },
      });
    });
  } catch (e) {
    // customerPhone / orderNumber columns may not exist yet on a lagging DB —
    // retry with just the base order so placement never hard-fails.
    try {
      order = await tenantDb(ctx.restaurantId, (tx) =>
        tx.order.create({ data: baseData, select: { id: true } }),
      );
    } catch (e2) {
      console.error("placeOrder: failed to create order", e2, e);
      return { ok: false, error: "We couldn't place your order. Please try again." };
    }
  }

  // Count these servings toward each item's daily cap (best-effort, own tx).
  await recordServingsSold(ctx.restaurantId, built.items);
  await recordVariantsSold(
    ctx.restaurantId,
    built.items.filter((i) => i.variantId).map((i) => ({ variantId: i.variantId!, quantity: i.quantity })),
  );

  // Alert the live cashier screen (the kitchen ticket prints on acceptance).
  await notifyOrdersChanged(ctx.restaurantId);

  return { ok: true, orderId: order.id, orderNumber: order.orderNumber ?? null };
}
