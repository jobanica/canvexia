import "server-only";

import { tenantDb } from "@/server/tenancy/scoped-db";
import { parsePrinterConfig, kitchenDestination } from "@/lib/printing/printer-config";

/**
 * Does the cashier's device need to pair a SECOND Bluetooth printer?
 *
 * True only for a Bluetooth kitchen printer. A network or cloud one is driven
 * by the server and needs nothing at the till, so showing a pairing button for
 * it would just be a button that does nothing useful.
 */
export async function kitchenNeedsBluetoothPairing(restaurantId: string): Promise<boolean> {
  try {
    const r = await tenantDb(restaurantId, (tx) =>
      tx.restaurant.findFirst({ select: { printerConfig: true } }),
    );
    const dest = kitchenDestination(parsePrinterConfig(r?.printerConfig).kitchen);
    return dest?.method === "bluetooth";
  } catch {
    return false;
  }
}

/**
 * Does the TILL printer need pairing in this browser?
 *
 * Same question for the receipt printer. It decides whether a device that
 * can't do Web Bluetooth should be TOLD so: a shop on a network or cloud
 * printer needs nothing at the till and shouldn't be shown a warning about a
 * capability it never uses, but a shop whose only printer is Bluetooth needs to
 * know why there's no button, or the till just looks broken.
 */
export async function tillNeedsBluetoothPairing(restaurantId: string): Promise<boolean> {
  try {
    const r = await tenantDb(restaurantId, (tx) =>
      tx.restaurant.findFirst({ select: { printMethod: true } }),
    );
    return r?.printMethod === "bluetooth";
  } catch {
    return false;
  }
}
