"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/tenancy/current-user";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { notifyOrdersChanged } from "@/server/realtime/notify";

/**
 * Advance orders (placed on the website, scheduled for a future date/time) all
 * pass through the owner for approval before they reach the kitchen. If a
 * downpayment is required, the owner verifies it here, then approves. Kept
 * separate from the live cashier/merchant boards so future orders don't clutter
 * "incoming now" — they're excluded there and managed entirely from this queue.
 */

const ROLES = ["admin", "cashier"] as const;

export interface AdvanceOrder {
  id: string;
  ref: string;
  scheduledFor: string | null; // ISO
  orderType: string;
  status: string; // pending | new | preparing | done | closed | cancelled
  approvalStatus: string; // awaiting | approved | declined
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  total: number;
  downpaymentAmount: number; // centavos required (0 = none)
  downpaymentRef: string | null;
  downpaymentPaid: boolean;
  createdAt: string;
  items: { name: string; quantity: number; note: string | null; modifiers: string[] }[];
}

/** All advance orders for the restaurant, newest-scheduled first. Safe pre-migration. */
export async function listAdvanceOrders(restaurantId: string): Promise<AdvanceOrder[]> {
  try {
    const rows = await tenantDb(restaurantId, (tx) =>
      tx.order.findMany({
        where: { scheduledFor: { not: null } },
        orderBy: { scheduledFor: "asc" },
        take: 200,
        select: {
          id: true,
          scheduledFor: true,
          orderType: true,
          status: true,
          approvalStatus: true,
          customerName: true,
          customerPhone: true,
          customerAddress: true,
          total: true,
          downpaymentAmount: true,
          downpaymentRef: true,
          downpaymentPaid: true,
          createdAt: true,
          items: {
            select: { nameAtTime: true, quantity: true, note: true, modifiers: { select: { nameAtTime: true } } },
          },
        },
      }),
    );
    return rows.map((o) => ({
      id: o.id,
      ref: `#${o.id.slice(0, 8).toUpperCase()}`,
      scheduledFor: o.scheduledFor ? o.scheduledFor.toISOString() : null,
      orderType: o.orderType,
      status: o.status,
      approvalStatus: o.approvalStatus ?? "awaiting",
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      customerAddress: o.customerAddress,
      total: o.total,
      downpaymentAmount: o.downpaymentAmount ?? 0,
      downpaymentRef: o.downpaymentRef,
      downpaymentPaid: o.downpaymentPaid ?? false,
      createdAt: o.createdAt.toISOString(),
      items: o.items.map((it) => ({
        name: it.nameAtTime,
        quantity: it.quantity,
        note: it.note,
        modifiers: it.modifiers.map((m) => m.nameAtTime),
      })),
    }));
  } catch {
    return []; // columns not migrated yet
  }
}

/** Owner confirms the booking (downpayment verified). Stays off the kitchen until "Send to kitchen". */
export async function approveAdvanceOrder(formData: FormData): Promise<void> {
  const staff = await requireStaff([...ROLES]);
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await tenantDb(staff.restaurantId, (tx) =>
    tx.order.updateMany({ where: { id, scheduledFor: { not: null } }, data: { approvalStatus: "approved" } }),
  );
  revalidatePath("/admin/advance-orders");
}

/** Owner declines the advance order — it's cancelled with a reason. */
export async function declineAdvanceOrder(formData: FormData): Promise<void> {
  const staff = await requireStaff([...ROLES]);
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200) || "Declined by restaurant";
  if (!id) return;
  await tenantDb(staff.restaurantId, (tx) =>
    tx.order.updateMany({
      where: { id, scheduledFor: { not: null } },
      data: { approvalStatus: "declined", status: "cancelled", cancelReason: reason },
    }),
  );
  await notifyOrdersChanged(staff.restaurantId);
  revalidatePath("/admin/advance-orders");
}

/** Toggle whether the downpayment has landed (owner verifies against GCash etc.). */
export async function setDownpaymentPaid(formData: FormData): Promise<void> {
  const staff = await requireStaff([...ROLES]);
  const id = String(formData.get("id") ?? "");
  const paid = String(formData.get("paid") ?? "") === "true";
  if (!id) return;
  await tenantDb(staff.restaurantId, (tx) =>
    tx.order.updateMany({ where: { id, scheduledFor: { not: null } }, data: { downpaymentPaid: paid } }),
  );
  revalidatePath("/admin/advance-orders");
}

/**
 * The advance-order queue, for the cashier's own screen.
 *
 * Same data as the owner's page, fetched by the logged-in staff member rather
 * than by a restaurantId passed in — the till has no business naming another
 * restaurant. Returns a list rather than revalidating a path, because the
 * cashier reads this in a modal on top of the board, not on a page of its own.
 */
export async function getAdvanceQueue(): Promise<AdvanceOrder[]> {
  let staff;
  try {
    staff = await requireStaff([...ROLES]);
  } catch {
    return [];
  }
  return listAdvanceOrders(staff.restaurantId);
}

export type SendToKitchenResult =
  | { ok: true; orders: AdvanceOrder[]; message: string }
  | { ok: false; error: string };

/**
 * Send one advance order to the kitchen, from the till.
 *
 * The same transition as the owner's button, but it answers with the refreshed
 * queue instead of revalidating a page the cashier isn't looking at. Guarded on
 * `status: "pending"`, so a second tap — or the other till doing it at the same
 * moment — changes nothing rather than resurrecting an order the kitchen has
 * already started or finished.
 */
export async function sendAdvanceToKitchenNow(orderId: string): Promise<SendToKitchenResult> {
  let staff;
  try {
    staff = await requireStaff([...ROLES]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  if (!orderId) return { ok: false, error: "No order." };

  let moved = 0;
  try {
    const res = await tenantDb(staff.restaurantId, (tx) =>
      tx.order.updateMany({
        where: { id: orderId, scheduledFor: { not: null }, status: "pending" },
        data: { status: "new", approvalStatus: "approved" },
      }),
    );
    moved = res.count;
  } catch (e) {
    console.error("sendAdvanceToKitchenNow failed", e);
    return { ok: false, error: "Couldn't send that order to the kitchen." };
  }
  if (moved === 0) {
    return { ok: false, error: "That order is already with the kitchen." };
  }

  await notifyOrdersChanged(staff.restaurantId);
  revalidatePath("/admin/advance-orders");
  return { ok: true, orders: await listAdvanceOrders(staff.restaurantId), message: "Sent to the kitchen." };
}

/** Push an approved advance order into the kitchen/cashier flow (status → new). */
export async function sendAdvanceToKitchen(formData: FormData): Promise<void> {
  const staff = await requireStaff([...ROLES]);
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await tenantDb(staff.restaurantId, (tx) =>
    tx.order.updateMany({
      where: { id, scheduledFor: { not: null }, status: "pending" },
      data: { status: "new", approvalStatus: "approved" },
    }),
  );
  await notifyOrdersChanged(staff.restaurantId);
  revalidatePath("/admin/advance-orders");
}
