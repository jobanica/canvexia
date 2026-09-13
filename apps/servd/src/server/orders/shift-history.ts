import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { getShiftSales, getShiftCashOuts } from "./shift-sales";
import { getShiftTransactions } from "./shift-transactions";
import { summariseShift, type ShiftBreakdown, type ShiftTransaction } from "@/lib/orders/shift-breakdown";
import { expectedCash } from "@/lib/orders/shift-rollup";
import { shiftRetentionCutoff } from "@/lib/orders/shift-retention";

/**
 * Past shifts and what each one took.
 *
 * Built because there wasn't one. A cashier's Z-report existed only while the
 * shift was open — close it, or lose it to a bug, and the only figure left
 * anywhere was the dashboard's, which answers a different question. An owner
 * checking last night's till had nothing to check it against.
 *
 * Every shift is recomputed from its own payments rather than a total stored
 * when it closed. A stored total can't be re-derived if it was ever written
 * wrong, and this exists precisely because a figure went missing once.
 */

export interface ShiftHistoryRow {
  id: string;
  cashier: string;
  openedAt: string;
  closedAt: string | null;
  open: boolean;
  /** Why it ended: signed out, or abandoned and closed automatically. */
  closedReason: string | null;
  gross: number;
  orderCount: number;
  cashCollected: number;
  cashOutTotal: number;
  expectedCash: number;
  byMethod: { method: string; amount: number; count: number }[];
  /** Everything that happened on the shift — counter and online, by type. */
  breakdown: ShiftBreakdown;
  /** Each transaction, in order. */
  transactions: ShiftTransaction[];
}

export async function listShiftHistory(
  restaurantId: string,
  limit = 40,
): Promise<ShiftHistoryRow[]> {
  let shifts;
  try {
    shifts = await systemDb((tx) =>
      tx.cashierShift.findMany({
        // Only what's inside the retention window. Anything older has been
        // purged, or is about to be — showing it would be a list that empties
        // itself while somebody is reading it.
        where: { restaurantId, openedAt: { gte: shiftRetentionCutoff() } },
        orderBy: { openedAt: "desc" },
        take: limit,
        select: {
          id: true,
          staffName: true,
          openedAt: true,
          closedAt: true,
          status: true,
          closedReason: true,
        },
      }),
    );
  } catch {
    return []; // cashier_shifts not migrated yet
  }

  return Promise.all(
    shifts.map(async (s) => {
      const [sales, cashOuts, transactions] = await Promise.all([
        getShiftSales(restaurantId, s.id, s.openedAt, s.closedAt),
        getShiftCashOuts(restaurantId, s.id, s.openedAt, s.closedAt),
        getShiftTransactions(restaurantId, s.openedAt, s.closedAt, s.id),
      ]);
      const cashCollected = sales.byMethod.find((m) => m.method === "cash")?.amount ?? 0;
      const cashOutTotal = cashOuts.reduce((t, c) => t + c.amount, 0);
      return {
        id: s.id,
        cashier: s.staffName,
        openedAt: s.openedAt.toISOString(),
        closedAt: s.closedAt?.toISOString() ?? null,
        open: s.status === "open",
        closedReason: s.closedReason,
        gross: sales.gross,
        orderCount: sales.orderCount,
        cashCollected,
        cashOutTotal,
        expectedCash: expectedCash(cashCollected, cashOutTotal),
        byMethod: sales.byMethod,
        breakdown: summariseShift(transactions),
        transactions,
      };
    }),
  );
}
