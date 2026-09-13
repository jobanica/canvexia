import "server-only";

import { tenantDb } from "@/server/tenancy/scoped-db";
import { parsePrinterConfig } from "@/lib/printing/printer-config";

/**
 * Does this kitchen want delivery addresses on its tickets?
 *
 * Off unless asked for. A kitchen that batches by zone needs it — a rider run
 * is built by grouping everything going the same way — but for everyone else
 * it's a customer's home address on a screen the whole line can see, and that
 * shouldn't arrive as a surprise from an app update.
 */
export async function kitchenShowsAddress(restaurantId: string): Promise<boolean> {
  try {
    const r = await tenantDb(restaurantId, (tx) =>
      tx.restaurant.findFirst({ select: { printerConfig: true } }),
    );
    return parsePrinterConfig(r?.printerConfig).kitchen.showAddress;
  } catch {
    return false;
  }
}

/**
 * Does this shop take payment before the food is made?
 *
 * Only decides which button the till leads with — the cashier can always take
 * payment on any order, and can always send one unpaid.
 */
export async function paysBeforeCooking(restaurantId: string): Promise<boolean> {
  try {
    const r = await tenantDb(restaurantId, (tx) =>
      tx.restaurant.findFirst({ select: { printerConfig: true } }),
    );
    return parsePrinterConfig(r?.printerConfig).payments.payFirst;
  } catch {
    return false;
  }
}
