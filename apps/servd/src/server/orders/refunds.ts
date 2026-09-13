"use server";

import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireStaff } from "@/server/tenancy/current-user";
import { notifyOrdersChanged } from "@/server/realtime/notify";
import { writeAudit } from "@/server/audit/log";
import { currentShift, stampPaymentShift } from "./shift-session";
import { planRefund, refundableRemaining, type RefundableLine } from "@/lib/orders/refund";

/**
 * Refunding items off a settled ticket.
 *
 * The case this exists for: the customer paid up front, then one of the dishes
 * couldn't be made because the kitchen ran out. Until now the only lever was
 * voiding, which refuses a paid order outright — correctly, since voiding
 * pretends a sale never happened and this one did. So there was nothing to do
 * but hand cash over and let the books disagree with the drawer.
 *
 * THE MONEY IS A NEGATIVE PAYMENT ROW. Not a column, not a separate table.
 * Every report in this app already sums payments — the dashboard, accounting,
 * the shift Z-report — so a refund reaches all three at once, on the day it was
 * given, credited to the cashier who gave it, with no special-casing anywhere
 * and no chance of the three disagreeing about the day's takings again.
 */

export type RefundState =
  | { ok: true; refunded: number; message: string }
  | { ok: false; error: string };

export interface RefundableItem {
  id: string;
  name: string;
  quantity: number;
  /** Gross for the whole line (unit incl. add-ons × quantity), centavos. */
  lineTotal: number;
  refundedQty: number;
  refundedAmount: number;
}

export interface RefundableTicket {
  orderId: string;
  label: string;
  /** What the ticket took, net of anything already given back. */
  collected: number;
  alreadyRefunded: number;
  remaining: number;
  items: RefundableItem[];
  /** False when the database hasn't run the migration yet. */
  ready: boolean;
}

/** The ticket as the refund screen needs to see it. */
export async function getRefundableTicket(orderId: string): Promise<RefundableTicket | null> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return null;
  }

  return tenantDb(staff.restaurantId, async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId },
      select: {
        id: true,
        customerName: true,
        table: { select: { tableNumber: true } },
        items: {
          select: {
            id: true,
            nameAtTime: true,
            quantity: true,
            unitPrice: true,
            modifiers: { select: { priceDeltaAtTime: true } },
          },
        },
      },
    });
    if (!order) return null;

    // Everything ever tendered, refunds included (they're negative).
    const agg = await tx.payment.aggregate({
      where: { orderId, status: "paid" },
      _sum: { amount: true },
    });
    const taken = await tx.payment.aggregate({
      where: { orderId, status: "paid", amount: { gt: 0 } },
      _sum: { amount: true },
    });
    const collected = taken._sum.amount ?? 0;
    const net = agg._sum.amount ?? 0;
    const alreadyRefunded = Math.max(0, collected - net);

    // Per-line refund state, read separately: the columns ship as a hand-run
    // migration, and a missing one should cost the refund button, not the
    // whole closed-tickets list.
    let refunded = new Map<string, { qty: number; amount: number }>();
    let ready = true;
    try {
      const rows = await tx.orderItem.findMany({
        where: { orderId },
        select: { id: true, refundedQty: true, refundedAmount: true },
      });
      refunded = new Map(
        rows.map((r) => [r.id, { qty: r.refundedQty ?? 0, amount: r.refundedAmount ?? 0 }]),
      );
    } catch {
      ready = false;
    }

    return {
      orderId: order.id,
      label: order.table?.tableNumber
        ? `Table ${order.table.tableNumber}`
        : order.customerName || order.id.slice(0, 8).toUpperCase(),
      collected,
      alreadyRefunded,
      remaining: refundableRemaining(collected, alreadyRefunded),
      ready,
      items: order.items.map((i) => ({
        id: i.id,
        name: i.nameAtTime,
        quantity: i.quantity,
        lineTotal:
          (i.unitPrice + i.modifiers.reduce((s, m) => s + m.priceDeltaAtTime, 0)) * i.quantity,
        refundedQty: refunded.get(i.id)?.qty ?? 0,
        refundedAmount: refunded.get(i.id)?.amount ?? 0,
      })),
    };
  }).catch(() => null);
}

/**
 * Hand money back for specific items.
 *
 * Behind the void PIN, same as voiding: giving cash out of the drawer is not
 * something a cashier should be able to do unsupervised.
 */
export async function refundItems(
  orderId: string,
  requests: { lineId: string; quantity: number }[],
  pin: string,
  reason: string,
): Promise<RefundState> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }

  const entered = (pin ?? "").trim();
  if (!entered) return { ok: false, error: "Enter the void PIN." };
  const why = (reason ?? "").trim();
  if (why.length < 3) return { ok: false, error: "Say why this is being refunded." };

  // Same PIN as a void, read the same best-effort way.
  let configured: string | null = null;
  try {
    const r = await tenantDb(staff.restaurantId, (tx) =>
      tx.restaurant.findFirst({ select: { cashierVoidPin: true } }),
    );
    configured = r?.cashierVoidPin ?? null;
  } catch {
    return { ok: false, error: "Refunds aren't set up yet. Ask an admin to set a void PIN." };
  }
  if (!configured) return { ok: false, error: "No void PIN set. Ask an admin to set one in Settings." };
  if (entered !== configured) return { ok: false, error: "Incorrect PIN." };

  const ticket = await getRefundableTicket(orderId);
  if (!ticket) return { ok: false, error: "Couldn't load that ticket." };
  if (!ticket.ready) {
    return {
      ok: false,
      error:
        "Refunds need one database update. Run prisma/manual/add-item-prepared-and-refunds.sql, then try again.",
    };
  }
  if (ticket.collected <= 0) {
    return { ok: false, error: "Nothing was collected on this ticket, so there's nothing to refund." };
  }

  const lines: RefundableLine[] = ticket.items.map((i) => ({
    id: i.id,
    lineTotal: i.lineTotal,
    quantity: i.quantity,
    refundedQty: i.refundedQty,
  }));
  const plan = planRefund(lines, requests, ticket.collected, ticket.alreadyRefunded);
  if (plan.error) return { ok: false, error: plan.error };
  if (plan.amount <= 0) return { ok: false, error: "That comes to nothing — check the quantities." };

  // Whose drawer the money leaves. Resolved outside the transaction, and a
  // missing shift never blocks the refund: the money went out either way, and
  // an unattributed refund in the books beats none.
  const shift = await currentShift(staff.restaurantId, staff.staffUserId);
  let refundPaymentId: string | null = null;

  try {
    await tenantDb(staff.restaurantId, async (tx) => {
      // The method to give it back on: whatever it was taken on, so a card sale
      // reverses to the card and the cash/card split for the day stays honest.
      const original = await tx.payment.findFirst({
        where: { orderId, status: "paid", amount: { gt: 0 } },
        orderBy: { amount: "desc" },
        select: { method: true, gateway: true },
      });

      const p = await tx.payment.create({
        data: {
          orderId,
          amount: -plan.amount, // negative: every report sums payments
          method: original?.method ?? "cash",
          gateway: original?.gateway ?? "manual",
          status: "paid",
        },
        select: { id: true },
      });
      refundPaymentId = p.id;

      for (const l of plan.lines) {
        const before = ticket.items.find((i) => i.id === l.lineId);
        await tx.orderItem.updateMany({
          where: { id: l.lineId, orderId },
          data: {
            refundedQty: (before?.refundedQty ?? 0) + l.quantity,
            refundedAmount: (before?.refundedAmount ?? 0) + l.amount,
          },
        });
      }

      await writeAudit(tx, staff.restaurantId, {
        actorStaffId: staff.staffUserId,
        actorEmail: staff.email,
        action: "order.refund",
        entityType: "order",
        entityId: orderId,
        reason: why,
        before: { collected: ticket.collected, alreadyRefunded: ticket.alreadyRefunded },
        after: { refunded: plan.amount, lines: plan.lines },
      });
    });
  } catch (e) {
    console.error("refundItems failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't record the refund." };
  }

  if (refundPaymentId) {
    await stampPaymentShift(refundPaymentId, shift?.id ?? null, staff.staffUserId);
  }
  await notifyOrdersChanged(staff.restaurantId);

  const pesos = (plan.amount / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 });
  return { ok: true, refunded: plan.amount, message: `₱${pesos} refunded.` };
}
