"use client";

/**
 * Persistent Web Bluetooth ESC/POS printers (Chromium desktop/Android only).
 *
 * Unlike the one-shot printViaBluetooth (which re-prompts every print), this
 * keeps the paired device so receipts print automatically after the first
 * "Connect printer" tap. Reconnects the GATT link on demand if it drops.
 *
 * TWO printers, not one. A restaurant can run a receipt printer at the till and
 * a docket printer at the pass, and a browser can hold a GATT connection to
 * each — they're separate devices with separate pairings. So everything here is
 * keyed by station, defaulting to "till" so existing callers are unchanged.
 *
 * The catch, and it's worth knowing before choosing this over a network
 * printer: both printers have to be in Bluetooth range of the cashier's device,
 * and that device has to be awake with the page open. A kitchen printer on the
 * network transport is driven by the server and has neither limitation.
 */

import { writeToPrinter } from "./ble-write";
import { forgetPrinter, recallPrinter, rememberPrinter } from "./printer-memory";

const DEFAULT_SERVICE = "000018f0-0000-1000-8000-00805f9b34fb";
const DEFAULT_CHAR = "00002af1-0000-1000-8000-00805f9b34fb";

/** Which printer: the cashier's receipt roll, or the kitchen's docket printer. */
export type PrinterStation = "till" | "kitchen";

type Slot = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  device: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  characteristic: any;
  serviceUuid: string;
  charUuid: string;
};

const slots: Record<PrinterStation, Slot> = {
  till: { device: null, characteristic: null, serviceUuid: DEFAULT_SERVICE, charUuid: DEFAULT_CHAR },
  kitchen: { device: null, characteristic: null, serviceUuid: DEFAULT_SERVICE, charUuid: DEFAULT_CHAR },
};

const listeners = new Set<(connected: boolean, station: PrinterStation) => void>();
function notify(station: PrinterStation) {
  for (const l of listeners) l(isPrinterPaired(station), station);
}

/**
 * Subscribe to pairing changes.
 *
 * The station is passed through so a button watching one printer can ignore
 * the other's events — without it, connecting the kitchen printer would flip
 * the till button's status too.
 */
export function onPrinterChange(
  cb: (connected: boolean, station: PrinterStation) => void,
): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function isBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

/**
 * Whether a printer has been paired this session. BLE printers drop the GATT
 * link when idle, so the live connection (isPrinterConnected) flickers between
 * prints — but the device stays paired and printBytes reconnects on demand.
 * Status and print routing key off pairing, not the momentary GATT state.
 */
export function isPrinterPaired(station: PrinterStation = "till"): boolean {
  return !!slots[station].device;
}

export function isPrinterConnected(station: PrinterStation = "till"): boolean {
  const s = slots[station];
  return !!(s.device?.gatt?.connected && s.characteristic);
}

export function printerName(station: PrinterStation = "till"): string | null {
  return slots[station].device?.name ?? null;
}

/** Pair + connect a printer. MUST be called from a user gesture (a click). */
export async function connectPrinter(opts?: {
  serviceUuid?: string;
  charUuid?: string;
  station?: PrinterStation;
}): Promise<void> {
  if (!isBluetoothSupported()) {
    throw new Error("Bluetooth isn't supported on this device/browser. Use Chrome on desktop or Android.");
  }
  const station = opts?.station ?? "till";
  const slot = slots[station];
  slot.serviceUuid = opts?.serviceUuid ?? DEFAULT_SERVICE;
  slot.charUuid = opts?.charUuid ?? DEFAULT_CHAR;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bt = (navigator as any).bluetooth;
  const device = await bt.requestDevice({
    acceptAllDevices: true,
    optionalServices: [slot.serviceUuid],
  });

  // Pairing the same physical printer to both stations would send every docket
  // to the receipt roll as well. Cheap to catch here, confusing to debug later.
  const other: PrinterStation = station === "till" ? "kitchen" : "till";
  if (slots[other].device && slots[other].device.id === device.id) {
    throw new Error(
      station === "kitchen"
        ? "That's the till printer. Pick the kitchen's printer instead."
        : "That's the kitchen printer. Pick the till's printer instead.",
    );
  }

  attach(station, device);
  await connectGatt(station);
  // Remembered only after the link actually came up. Storing on selection alone
  // would have the till reconnecting every morning to a device that was picked
  // by mistake and never worked.
  rememberPrinter(station, {
    id: device.id,
    name: device.name ?? null,
    serviceUuid: slot.serviceUuid,
    charUuid: slot.charUuid,
  });
  notify(station);
}

/** Put a device into a slot and watch for the link dropping. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function attach(station: PrinterStation, device: any): void {
  const slot = slots[station];
  slot.device = device;
  device.addEventListener("gattserverdisconnected", () => {
    // Only the live link is cleared, never the pairing. A BLE printer drops
    // GATT whenever it is idle — that is normal, and printBytes brings it back
    // on demand. Treating it as an unpair is what made the till ask to be
    // reconnected several times a shift.
    slot.characteristic = null;
    notify(station);
  });
}

/** In flight, so two mounting buttons don't both restore the same printer. */
let restoring: Promise<void> | null = null;

/**
 * Reconnect to the printers this browser already has permission for.
 *
 * The pairing never expired — the page just forgot it. Chrome keeps the device
 * grant for the origin, and getDevices() returns those devices with no chooser
 * and no user gesture, so a till that paired once in January opens in March
 * already connected.
 *
 * Everything here fails soft. A printer that is switched off, out of range or
 * paired to somebody else's phone still gets restored as PAIRED without a live
 * link, which is the same state it sits in between prints anyway — printBytes
 * opens the link when there is something to print.
 */
export async function restorePairedPrinters(): Promise<void> {
  if (restoring) return restoring;
  restoring = (async () => {
    if (!isBluetoothSupported()) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bt = (navigator as any).bluetooth;
    // Older Chromium has Web Bluetooth but not the permissions backend that
    // getDevices() needs. Nothing to do there: the button still pairs by hand.
    if (typeof bt.getDevices !== "function") return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let known: any[] = [];
    try {
      known = await bt.getDevices();
    } catch {
      return;
    }

    for (const station of ["till", "kitchen"] as PrinterStation[]) {
      const slot = slots[station];
      if (slot.device) continue; // already paired in this session
      const saved = recallPrinter(station);
      if (!saved) continue;
      // Never let one physical printer end up on both stations — every docket
      // would come out of the receipt roll as well.
      const other: PrinterStation = station === "till" ? "kitchen" : "till";
      if (slots[other].device?.id === saved.id) continue;

      const device = known.find((d) => d?.id === saved.id);
      if (!device) {
        // Permission revoked, a different browser profile, or the site data was
        // cleared. Drop the note so the button offers a fresh pairing instead
        // of pretending a printer is there.
        forgetPrinter(station);
        continue;
      }

      slot.serviceUuid = saved.serviceUuid;
      slot.charUuid = saved.charUuid;
      attach(station, device);
      notify(station);

      // Warm the link now rather than making the first sale of the day wait.
      try {
        await connectGatt(station);
        notify(station);
      } catch {
        /* printer off or out of range — printBytes will connect when needed */
      }
    }
  })().finally(() => {
    restoring = null;
  });
  return restoring;
}

async function connectGatt(station: PrinterStation): Promise<void> {
  const slot = slots[station];
  const server = await slot.device.gatt.connect();
  const svc = await server.getPrimaryService(slot.serviceUuid);
  slot.characteristic = await svc.getCharacteristic(slot.charUuid);
}

/**
 * Send ESC/POS bytes to the connected printer, reconnecting if the link dropped.
 *
 * Retries ONCE on failure, and that retry is the point of this function rather
 * than a nicety. A BLE printer drops its GATT link whenever it's idle, so the
 * link is routinely dead when a sale settles — and it can also die between the
 * check and the write, which no amount of checking first will catch. Without
 * the retry that race surfaces as "the receipt didn't print and the drawer
 * didn't open", the two together, because both ride the same connection.
 *
 * One retry, not a loop: if a fresh GATT connection also fails, the printer is
 * off, out of range, or paired to another device, and hammering it just delays
 * telling the cashier something is actually wrong.
 */
export async function printBytes(
  bytes: Uint8Array,
  station: PrinterStation = "till",
): Promise<void> {
  const slot = slots[station];
  if (!slot.device) throw new Error("No printer connected.");

  try {
    if (!isPrinterConnected(station)) await connectGatt(station);
    await writeToPrinter(slot.characteristic, bytes);
    return;
  } catch {
    /* fall through to one clean retry */
  }

  // Drop what we think we know about the link and rebuild it from scratch —
  // a stale characteristic from the dead connection is exactly what fails.
  slot.characteristic = null;
  try {
    slot.device.gatt?.disconnect();
  } catch {
    /* already gone */
  }
  await connectGatt(station);
  await writeToPrinter(slot.characteristic, bytes);
}

export function disconnectPrinter(station: PrinterStation = "till"): void {
  const slot = slots[station];
  try {
    slot.device?.gatt?.disconnect();
  } catch {
    /* ignore */
  }
  // Fully unpair so the status reverts and the next print won't silently
  // reconnect to a printer the user deliberately disconnected — including on
  // the next page load, which is why the stored note goes too.
  slot.device = null;
  slot.characteristic = null;
  forgetPrinter(station);
  notify(station);
}

/** Decode a base64 ESC/POS payload into bytes (browser-safe). */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
