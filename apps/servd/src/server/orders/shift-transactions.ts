import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { manilaTime } from "@/lib/time/manila";
import { isOrderType, type OrderTypeKey } from "@/lib/orders/order-type";
import type { ShiftTransaction } from "@/lib/orders/shift-breakdown";

/**
 * Every payment taken during one shift — counter AND online.
 *
 * Wider on purpose than getShiftSales, which answers "what is in my drawer"
 * and therefore counts only till money. An owner reviewing a shift wants the
 * whole evening: the online orders too, split by how the food went out.
 *
 * The two are kept apart rather than merged. `counter` marks the money a
 * cashier physically handled, and only those rows feed the drawer figures —
 * fold an online sale into a drawer total and the cashier is short by exactly
 * that amount at the end of every shift.
 *
 * Window: from the shift opening to its close, or to now while it's still
 * running. Online payments have no shift stamped on them (no cashier touched
 * them), so they're matched by time — which is the honest answer to "what
 * happened while this person was on".
 */
export async function getShiftTransactions(
  restaurantId: string,
  openedAt: Date,
  closedAt: Date | null,
  shiftId?: string,
): Promise<ShiftTransaction[]> {
  const window = { gte: openedAt, ...(closedAt ? { lte: closedAt } : {}) };
  try {
    const payments = await systemDb((tx) =>
      tx.payment.findMany({
        where: {
          status: "paid",
          order: { restaurantId },
          // Either stamped to this shift, or taken inside its window. The
          // stamped clause matters for a payment settled a moment after the
          // shift closed; the window clause is what catches online sales.
          OR: [...(shiftId ? [{ shiftId }] : []), { createdAt: window }],
        },
        orderBy: { createdAt: "asc" },
        select: {
          amount: true,
          method: true,
          gateway: true,
          orderId: true,
          createdAt: true,
        },
      }),
    );
    if (payments.length === 0) return [];

    const ids = [...new Set(payments.map((p) => p.orderId))];
    // Order type and label are read best-effort: they're newer columns, and a
    // missing label must not cost the owner the transaction list itself.
    let meta = new Map<
      string,
      { orderType: OrderTypeKey; label: string }
    >();
    try {
      const orders = await systemDb((tx) =>
        tx.order.findMany({
          where: { id: { in: ids }, restaurantId },
          select: {
            id: true,
            orderType: true,
            orderNumber: true,
            customerName: true,
            table: { select: { tableNumber: true } },
          },
        }),
      );
      meta = new Map(
        orders.map((o) => [
          o.id,
          {
            orderType: isOrderType(o.orderType) ? o.orderType : "dine_in",
            label:
              o.orderNumber != null
                ? `#${o.orderNumber}`
                : o.table?.tableNumber
                  ? `Table ${o.table.tableNumber}`
                  : o.customerName || o.id.slice(0, 8),
          },
        ]),
      );
    } catch {
      /* columns not migrated — fall back below */
    }

    return payments.map((p) => {
      const m = meta.get(p.orderId);
      return {
        orderId: p.orderId,
        label: m?.label ?? p.orderId.slice(0, 8),
        // Time only: the shift header already carries the date, and the full
        // stamp is wide enough on a phone to push the amount off the screen.
        at: manilaTime(p.createdAt),
        orderType: m?.orderType ?? "dine_in",
        method: p.method,
        amount: p.amount,
        // "manual" is how a cashier settling at the till is recorded; anything
        // else came through a gateway with nobody standing at a drawer.
        counter: p.gateway === "manual",
      };
    });
  } catch {
    return [];
  }
}
