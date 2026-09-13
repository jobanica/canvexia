import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { rollupShiftPayments } from "@/lib/orders/shift-rollup";
import { manilaStartOfDay } from "@/lib/time/manila";

/**
 * The takings of ONE cashier shift.
 *
 * Separate from getSalesReport, which answers a different question: the
 * accounting report is "what did this restaurant take between two dates" and
 * must include online payments nobody stood at a till for. This is "what is in
 * MY drawer".
 *
 * A payment counts when EITHER it carries this shift's id, OR it is a counter
 * payment taken since the shift opened that carries no shift at all. That
 * second clause is not a nicety — without it the report was silently empty
 * whenever stamping hadn't happened: rows written before the shift columns were
 * migrated, or during any window where the stamp failed. A Z-report that reads
 * ₱0.00 while the closed-orders list shows a dozen paid tickets is worse than
 * no report, because the cashier can't tell whether the money or the software
 * is missing.
 *
 * `gateway: "manual"` is what makes the fallback safe: that is how a cashier
 * settling at the till is recorded, so an online payment nobody handled never
 * gets swept into somebody's drawer.
 */

export interface ShiftSales {
  gross: number;
  orderCount: number;
  discounts: number;
  byMethod: { method: string; amount: number; count: number }[];
}

const empty: ShiftSales = { gross: 0, orderCount: 0, discounts: 0, byMethod: [] };

/**
 * Payments belonging to a shift: stamped, or unstamped-at-the-till within it.
 *
 * `closedAt` bounds the unstamped clause. Without it a finished shift would
 * keep absorbing every till payment taken after it ended, so reprinting last
 * night's Z-report a week later would show a week of somebody else's takings.
 */
function shiftPaymentWhere(
  restaurantId: string,
  shiftId: string,
  openedAt: Date,
  closedAt?: Date | null,
) {
  const window = closedAt ? { gte: openedAt, lte: closedAt } : { gte: openedAt };
  return {
    status: "paid" as const,
    order: { restaurantId },
    OR: [
      { shiftId },
      { shiftId: null, gateway: "manual" as const, createdAt: window },
    ],
  };
}

export async function getShiftSales(
  restaurantId: string,
  shiftId: string,
  openedAt: Date,
  closedAt?: Date | null,
): Promise<ShiftSales> {
  let payments;
  try {
    payments = await systemDb((tx) =>
      tx.payment.findMany({
        where: shiftPaymentWhere(restaurantId, shiftId, openedAt, closedAt),
        select: { amount: true, method: true, orderId: true },
      }),
    );
  } catch {
    // shiftId column not migrated yet — fall back to every counter payment
    // inside the shift's window rather than reporting nothing at all.
    try {
      payments = await systemDb((tx) =>
        tx.payment.findMany({
          where: {
            status: "paid",
            gateway: "manual",
            createdAt: closedAt ? { gte: openedAt, lte: closedAt } : { gte: openedAt },
            order: { restaurantId },
          },
          select: { amount: true, method: true, orderId: true },
        }),
      );
    } catch {
      return empty;
    }
  }

  if (payments.length === 0) return empty;
  const rolled = rollupShiftPayments(payments);

  // Discounts given on the orders this shift settled (best-effort).
  let discounts = 0;
  try {
    const orders = await systemDb((tx) =>
      tx.order.findMany({
        where: { id: { in: rolled.orderIds }, restaurantId },
        select: { discountAmount: true },
      }),
    );
    discounts = orders.reduce((s, o) => s + (o.discountAmount ?? 0), 0);
  } catch {
    /* column lag */
  }

  return {
    gross: rolled.gross,
    orderCount: rolled.orderCount,
    discounts,
    byMethod: rolled.byMethod,
  };
}

/** Cash-outs taken from this shift's drawer, same stamped-or-since rule. */
export async function getShiftCashOuts(
  restaurantId: string,
  shiftId: string,
  openedAt: Date,
  closedAt?: Date | null,
): Promise<{ amount: number; note: string | null; at: string }[]> {
  const map = (rows: { amount: number; note: string | null; createdAt: Date }[]) =>
    rows.map((r) => ({ amount: r.amount, note: r.note, at: r.createdAt.toISOString() }));
  const window = closedAt ? { gte: openedAt, lte: closedAt } : { gte: openedAt };
  try {
    const rows = await systemDb((tx) =>
      tx.cashMovement.findMany({
        where: {
          restaurantId,
          type: "cash_out",
          OR: [{ shiftId }, { shiftId: null, createdAt: window }],
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { amount: true, note: true, createdAt: true },
      }),
    );
    return map(rows);
  } catch {
    try {
      const rows = await systemDb((tx) =>
        tx.cashMovement.findMany({
          where: { restaurantId, type: "cash_out", createdAt: window },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: { amount: true, note: true, createdAt: true },
        }),
      );
      return map(rows);
    } catch {
      return [];
    }
  }
}

/**
 * Every counter sale today, whichever shift took it.
 *
 * Printed under the shift's own figures as context. A shift that opened at
 * 8 PM legitimately shows nothing for the morning's trade, and a cashier
 * looking at ₱0.00 has no way to tell that from a broken report — this line
 * says "the day did happen, it just wasn't on your watch".
 */
export async function getDayCounterSales(
  restaurantId: string,
): Promise<{ gross: number; orderCount: number }> {
  try {
    const payments = await systemDb((tx) =>
      tx.payment.findMany({
        where: {
          status: "paid",
          gateway: "manual",
          createdAt: { gte: manilaStartOfDay() },
          order: { restaurantId },
        },
        select: { amount: true, method: true, orderId: true },
      }),
    );
    const rolled = rollupShiftPayments(payments);
    return { gross: rolled.gross, orderCount: rolled.orderCount };
  } catch {
    return { gross: 0, orderCount: 0 };
  }
}
