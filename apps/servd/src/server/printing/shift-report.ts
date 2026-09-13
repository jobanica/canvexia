import "server-only";

import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireStaff } from "@/server/tenancy/current-user";
import { getShiftSummary } from "@/server/orders/shift-summary";
import { buildShiftReport, type ShiftReport } from "@/lib/printing/report";
import { manilaDate, manilaTime } from "@/lib/time/manila";

/**
 * The end-of-shift report for the logged-in cashier, laid out for 32-column
 * thermal paper.
 *
 * Built here rather than in either caller so the bytes sent to the printer and
 * the HTML fallback page are the same document. Two hand-maintained layouts for
 * one report is how a printed total ends up disagreeing with the one on screen.
 */

type PrinterConfig = { receipt?: { address?: string | null; phone?: string | null } };

export interface ShiftReportBundle {
  report: ShiftReport;
  restaurantId: string;
  printMethod: string;
  printerConfig: PrinterConfig;
}

export async function getShiftReport(): Promise<ShiftReportBundle | null> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return null;
  }

  const summary = await getShiftSummary();
  if (!summary) return null;

  const restaurant = await tenantDb(staff.restaurantId, (tx) =>
    tx.restaurant.findFirstOrThrow({
      select: { name: true, displayName: true, printMethod: true, printerConfig: true },
    }),
  );
  const config = (restaurant.printerConfig as PrinterConfig | null) ?? {};
  const r = config.receipt ?? {};

  const report = buildShiftReport({
    restaurantName: restaurant.displayName || restaurant.name,
    address: r.address,
    phone: r.phone,
    cashier: summary.cashier,
    // Manila, explicitly: the server runs UTC, so an unqualified date would
    // label a 9 PM shift with tomorrow's day. When shifts are on, this is the
    // shift's own start rather than midnight — the report covers one turn at
    // the till, and the paper should say which one.
    dayLabel: summary.openedAt
      ? `${manilaDate(summary.openedAt)} ${manilaTime(summary.openedAt)}`
      : manilaDate(summary.from),
    printedAt: manilaTime(new Date()),
    orderCount: summary.orderCount,
    gross: summary.gross,
    discounts: summary.discounts,
    byMethod: summary.byMethod,
    expenses: summary.expenses,
    expensesTotal: summary.expensesTotal,
    cashCollected: summary.cashCollected,
    cashOuts: summary.cashOuts,
    expectedCash: summary.expectedCash,
    net: summary.net,
    dayGross: summary.dayGross,
    dayOrderCount: summary.dayOrderCount,
  });

  return {
    report,
    restaurantId: staff.restaurantId,
    printMethod: restaurant.printMethod,
    printerConfig: config,
  };
}
