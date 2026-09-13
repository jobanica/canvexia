"use server";

import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireStaff } from "@/server/tenancy/current-user";
import { notifyOrdersChanged } from "@/server/realtime/notify";
import { awardPointsForOrder } from "@/server/loyalty/loyalty";
import { ensureSettlementPayment } from "@/server/orders/settle-payment";
import { notifyCustomer, restaurantDisplayName } from "@/server/sms/notify";

export interface DeliveryOrder {
  id: string;
  status: string;
  paymentStatus: string;
  deliveryStatus: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  lat: number | null;
  lng: number | null;
  total: number;
  itemCount: number;
  items: { name: string; quantity: number }[];
  createdAt: string;
}

const ACTIVE = ["pending", "new", "preparing", "done"] as const;

/** All active delivery orders (for the cashier's delivery view). */
export async function getDeliveryOrders(): Promise<DeliveryOrder[]> {
  const staff = await requireStaff(["cashier", "admin"]);
  const baseSelect = {
    id: true,
    status: true,
    paymentStatus: true,
    total: true,
    createdAt: true,
    customerName: true,
    customerPhone: true,
    customerAddress: true,
    items: { select: { nameAtTime: true, quantity: true } },
  } as const;

  type Row = {
    id: string;
    status: string;
    paymentStatus: string;
    total: number;
    createdAt: Date;
    customerName: string | null;
    customerPhone: string | null;
    customerAddress: string | null;
    customerLat?: number | null;
    customerLng?: number | null;
    deliveryStatus?: string | null;
    items: { nameAtTime: string; quantity: number }[];
  };

  let rows: Row[];
  try {
    rows = await tenantDb(staff.restaurantId, (tx) =>
      tx.order.findMany({
        where: { orderType: "delivery", status: { in: [...ACTIVE] } },
        orderBy: { createdAt: "desc" },
        select: { ...baseSelect, customerLat: true, customerLng: true, deliveryStatus: true },
      }),
    );
  } catch {
    try {
      rows = await tenantDb(staff.restaurantId, (tx) =>
        tx.order.findMany({
          where: { orderType: "delivery", status: { in: [...ACTIVE] } },
          orderBy: { createdAt: "desc" },
          select: baseSelect,
        }),
      );
    } catch {
      return [];
    }
  }

  return rows.map((o) => ({
    id: o.id,
    status: o.status,
    paymentStatus: o.paymentStatus,
    deliveryStatus: o.deliveryStatus ?? null,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    customerAddress: o.customerAddress,
    lat: o.customerLat ?? null,
    lng: o.customerLng ?? null,
    total: o.total,
    itemCount: o.items.length,
    items: o.items.map((i) => ({ name: i.nameAtTime, quantity: i.quantity })),
    createdAt: o.createdAt.toISOString(),
  }));
}

type Result = { ok: boolean; orders?: DeliveryOrder[]; error?: string };

/** Mark a delivery order out for delivery — and text the customer (best-effort). */
export async function markOutForDelivery(orderId: string): Promise<Result> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  let order: { customerName: string | null; customerPhone: string | null } | null = null;
  try {
    order = await tenantDb(staff.restaurantId, async (tx) => {
      const o = await tx.order.findFirst({ where: { id: orderId }, select: { customerName: true, customerPhone: true } });
      await tx.order.updateMany({ where: { id: orderId }, data: { deliveryStatus: "out_for_delivery" } });
      return o;
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not update.";
    return { ok: false, error: /deliveryStatus|column/i.test(msg) ? "Needs a quick database update. Run the migration, then try again." : msg };
  }

  // Best-effort SMS to the customer.
  if (order?.customerPhone) {
    const who = await restaurantDisplayName(staff.restaurantId);
    const name = order.customerName ? `Hi ${order.customerName}, ` : "";
    await notifyCustomer(staff.restaurantId, order.customerPhone, `${name}your order from ${who} is on the way! 🛵`);
  }

  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, orders: await getDeliveryOrders() };
}

/** Mark a delivery order delivered — settles it (paid, closed) + awards points. */
export async function markDelivered(orderId: string): Promise<Result> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  let amount = 0;
  let phone: string | null = null;
  try {
    await tenantDb(staff.restaurantId, async (tx) => {
      const o = await tx.order.findFirst({ where: { id: orderId }, select: { total: true, customerPhone: true } });
      if (!o) throw new Error("Order not found");
      amount = o.total;
      phone = o.customerPhone;
      await tx.order.updateMany({
        where: { id: orderId },
        data: { deliveryStatus: "delivered", status: "closed", paymentStatus: "paid", billRequested: false },
      });
      await ensureSettlementPayment(tx, orderId);
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not update.";
    return { ok: false, error: /deliveryStatus|column/i.test(msg) ? "Needs a quick database update. Run the migration, then try again." : msg };
  }

  await awardPointsForOrder(staff.restaurantId, orderId, amount, phone);
  if (phone) {
    const who = await restaurantDisplayName(staff.restaurantId);
    await notifyCustomer(staff.restaurantId, phone, `Your order from ${who} has been delivered. Thank you, and enjoy! 🙏`);
  }
  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, orders: await getDeliveryOrders() };
}
