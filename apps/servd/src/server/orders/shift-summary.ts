"use server";

import { requireStaff } from "@/server/tenancy/current-user";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { getSalesReport, getExpenses } from "@/server/accounting/queries";
import { getCashOutsToday } from "@/server/orders/cash-out";
import { manilaStartOfDay, manilaEndOfDay } from "@/lib/time/manila";
import { ensureShift } from "./shift-session";
import { getShiftSales, getShiftCashOuts, getDayCounterSales } from "./shift-sales";
import { expectedCash } from "@/lib/orders/shift-rollup";
import { staffLabel } from "@/server/tenancy/staff-name";

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  card_terminal: "Card",
  gcash: "GCash",
  maya: "Maya",
  online_gcash: "GCash (online)",
  online_card: "Card (online)",
  bank_transfer: "Bank transfer",
  third_party: "Third-party app",
};

export interface ShiftSummary {
  restaurantName: string;
  cashier: string;
  /** Null when shift tracking isn't migrated yet — the report is day-wide then. */
  shiftId: string | null;
  openedAt: string | null;
  from: string;
  to: string;
  gross: number;
  orderCount: number;
  discounts: number;
  byMethod: { label: string; amount: number; count: number }[];
  expensesTotal: number;
  expenses: { category: string; amount: number; note: string | null }[];
  cashOutTotal: number;
  cashOuts: { amount: number; note: string | null; at: string }[];
  cashCollected: number; // cash payments today
  expectedCash: number; // cash collected − cash-outs (what should be in the drawer)
  net: number; // gross − expenses
  /** Every counter sale today, across all shifts — context, not drawer money. */
  dayGross: number;
  dayOrderCount: number;
}

/** The restaurant's name and a human name for the cashier, for the header. */
async function identify(
  restaurantId: string,
  staffUserId: string,
): Promise<{ restaurantName: string; cashier: string }> {
  try {
    return await tenantDb(restaurantId, async (tx) => {
      const [r, name] = await Promise.all([
        tx.restaurant.findFirstOrThrow({ select: { name: true, displayName: true } }),
        staffLabel(restaurantId, staffUserId),
      ]);
      return { restaurantName: r.displayName || r.name, cashier: name };
    });
  } catch {
    return { restaurantName: "", cashier: "—" };
  }
}

/**
 * The Z-report for the CURRENT cashier's open shift: what they took, what came
 * out of their drawer, and what should be in it.
 *
 * Scoped to the shift, not the calendar day. It used to total every payment the
 * restaurant took since midnight, so the second cashier of the day opened their
 * summary and found the first cashier's sales already in it — which is what
 * made separate logins pointless.
 *
 * Falls back to the whole-day view when shift tracking isn't available yet
 * (migration not run). Wrong-but-familiar beats an empty report the cashier
 * can't close their drawer with.
 */
export async function getShiftSummary(): Promise<ShiftSummary | null> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return null;
  }

  const who = await identify(staff.restaurantId, staff.staffUserId);
  const shift = await ensureShift(staff.restaurantId, staff.staffUserId, () =>
    staffLabel(staff.restaurantId, staff.staffUserId),
  );

  // Expenses stay day-scoped: they're recorded in the back office against a
  // date, not by a cashier at a till, so there is nothing to attribute.
  const dayFrom = manilaStartOfDay();
  const dayTo = manilaEndOfDay();
  const expenses = await getExpenses(staff.restaurantId, dayFrom, dayTo);

  let sales;
  let cashOuts;
  let from = shift?.openedAt ?? dayFrom;
  if (shift) {
    [sales, cashOuts] = await Promise.all([
      getShiftSales(staff.restaurantId, shift.id, shift.openedAt),
      getShiftCashOuts(staff.restaurantId, shift.id, shift.openedAt),
    ]);
  } else {
    // Pre-migration fallback: the old day-wide behaviour.
    from = dayFrom;
    [sales, cashOuts] = await Promise.all([
      getSalesReport(staff.restaurantId, dayFrom, dayTo),
      getCashOutsToday(staff.restaurantId).then((rows) =>
        rows.map((r) => ({ amount: r.amount, note: r.note, at: r.createdAt })),
      ),
    ]);
  }
  const to = dayTo;

  // The day's counter trade, whoever took it. Printed as context so a shift
  // that opened this evening doesn't read like a broken report when the
  // morning's tickets are sitting right there in Closed orders.
  const day = await getDayCounterSales(staff.restaurantId);

  const expensesTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const cashOutTotal = cashOuts.reduce((s, c) => s + c.amount, 0);
  const cashCollected = sales.byMethod.find((m) => m.method === "cash")?.amount ?? 0;

  return {
    restaurantName: who.restaurantName,
    cashier: who.cashier,
    shiftId: shift?.id ?? null,
    openedAt: shift?.openedAt.toISOString() ?? null,
    from: from.toISOString(),
    to: to.toISOString(),
    gross: sales.gross,
    orderCount: sales.orderCount,
    discounts: sales.discounts,
    byMethod: sales.byMethod.map((m) => ({
      label: METHOD_LABEL[m.method] ?? m.method,
      amount: m.amount,
      count: m.count,
    })),
    expensesTotal,
    expenses: expenses.map((e) => ({ category: e.category, amount: e.amount, note: e.note })),
    cashOutTotal,
    cashOuts,
    cashCollected,
    expectedCash: expectedCash(cashCollected, cashOutTotal),
    net: sales.gross - expensesTotal,
    dayGross: day.gross,
    dayOrderCount: day.orderCount,
  };
}
