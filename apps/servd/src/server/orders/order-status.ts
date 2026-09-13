"use server";

import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * Public order-status lookup for the diner's live tracker. Diners have no
 * session — access is authorized by the table token + the order id together
 * (both are needed, and the order must belong to that restaurant + table).
 */
export interface OrderStatusResult {
  status: string; // pending | new | preparing | done | closed | cancelled
  paymentStatus: string;
  total: number; // gross subtotal (centavos)
  discountAmount: number; // centavos off
  discountLabel: string | null;
  net: number; // total - discount
  orderNumber: number | null; // counter/stall ticket number, if any
}

export async function getOrderStatus(
  slug: string,
  tableToken: string,
  orderId: string,
): Promise<OrderStatusResult | null> {
  if (!slug || !tableToken || !orderId) return null;
  return systemDb(async (tx) => {
    const restaurant = await tx.restaurant.findFirst({
      where: { slug },
      select: { id: true },
    });
    if (!restaurant) return null;
    const table = await tx.table.findFirst({
      where: { restaurantId: restaurant.id, qrToken: tableToken },
      select: { id: true },
    });
    if (!table) return null;

    // Base fields always exist; discount columns may lag on prod — read them
    // best-effort so the tracker never breaks before the migration.
    const order = await tx.order.findFirst({
      where: { id: orderId, restaurantId: restaurant.id, tableId: table.id },
      select: { status: true, paymentStatus: true, total: true, creditApplied: true },
    });
    if (!order) return null;

    let discountAmount = 0;
    let discountLabel: string | null = null;
    try {
      const disc = await tx.order.findFirst({
        where: { id: orderId },
        select: { discountAmount: true, discountLabel: true },
      });
      discountAmount = disc?.discountAmount ?? 0;
      discountLabel = disc?.discountLabel ?? null;
    } catch {
      /* columns not migrated yet */
    }

    let orderNumber: number | null = null;
    try {
      const n = await tx.order.findFirst({ where: { id: orderId }, select: { orderNumber: true } });
      orderNumber = n?.orderNumber ?? null;
    } catch {
      /* column not migrated yet */
    }

    return {
      status: order.status,
      paymentStatus: order.paymentStatus,
      total: order.total,
      discountAmount,
      discountLabel,
      net: Math.max(0, order.total - discountAmount - (order.creditApplied ?? 0)),
      orderNumber,
    };
  });
}
