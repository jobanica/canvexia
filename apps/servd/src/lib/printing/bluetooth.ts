"use client";

/**
 * Web Bluetooth ESC/POS transport. Works ONLY on Chromium browsers (desktop /
 * Android) and only with BLE ESC/POS printers — NOT Safari/iOS. We detect
 * support at runtime and the UI falls back to another method when unavailable.
 *
 * Service/characteristic UUIDs vary by printer; defaults cover the common
 * "serial over GATT" profile but can be overridden in printerConfig.
 */

import { writeToPrinter } from "./ble-write";

const DEFAULT_SERVICE = "000018f0-0000-1000-8000-00805f9b34fb";
const DEFAULT_CHAR = "00002af1-0000-1000-8000-00805f9b34fb";

export function isBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export async function printViaBluetooth(
  bytes: Uint8Array,
  opts?: { serviceUuid?: string; charUuid?: string },
): Promise<void> {
  if (!isBluetoothSupported()) {
    throw new Error("Bluetooth printing isn't supported on this device/browser.");
  }
  const service = opts?.serviceUuid ?? DEFAULT_SERVICE;
  const characteristic = opts?.charUuid ?? DEFAULT_CHAR;

  // Web Bluetooth isn't in the default TS DOM lib — narrow via a local cast.
  const bt = (navigator as unknown as { bluetooth: any }).bluetooth;
  const device = await bt.requestDevice({
    acceptAllDevices: true,
    optionalServices: [service],
  });
  const server = await device.gatt.connect();
  const svc = await server.getPrimaryService(service);
  const ch = await svc.getCharacteristic(characteristic);

  // Paced + acknowledged where possible, and it waits for the printer to drain
  // before the link drops — see ble-write for the receipt this lost bytes from.
  await writeToPrinter(ch, bytes);
  server.disconnect();
}
