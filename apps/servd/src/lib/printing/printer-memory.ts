"use client";

import type { PrinterStation } from "./bt-printer";

/**
 * Remembering which printer a till is paired to, across page loads.
 *
 * Web Bluetooth grants a device permission to the ORIGIN, and Chrome keeps that
 * grant after the tab closes — but the JavaScript object representing the
 * device dies with the page. So the browser still has permission while the app
 * has forgotten which printer to ask for, and the cashier is sent back to the
 * device chooser every morning even though nothing was actually revoked.
 *
 * This stores the one thing needed to close that gap: the device's id, which is
 * what navigator.bluetooth.getDevices() hands back for an already-permitted
 * device — no chooser, no user gesture.
 *
 * The id is origin-scoped and opaque; it identifies nothing outside this app.
 */

export interface RememberedPrinter {
  /** Origin-scoped device id, matched against getDevices(). */
  id: string;
  /** Shown in the button's tooltip, so a cook can tell which printer it means. */
  name: string | null;
  serviceUuid: string;
  charUuid: string;
}

export function printerKey(station: PrinterStation): string {
  return `servd:btPrinter:${station}`;
}

/**
 * Read back a stored printer, rejecting anything that isn't one.
 *
 * Pure, and deliberately strict: this decides whether the app silently
 * reconnects to a device. Stored JSON can be stale from an older shape, hand-
 * edited, or shared with another tab mid-write, and a half-valid record would
 * surface as a confusing failure at the moment of printing rather than here.
 */
export function parseRemembered(raw: string | null | undefined): RememberedPrinter | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const d = data as Partial<RememberedPrinter>;
  if (typeof d.id !== "string" || !d.id) return null;
  if (typeof d.serviceUuid !== "string" || !d.serviceUuid) return null;
  if (typeof d.charUuid !== "string" || !d.charUuid) return null;
  return {
    id: d.id,
    name: typeof d.name === "string" && d.name ? d.name : null,
    serviceUuid: d.serviceUuid,
    charUuid: d.charUuid,
  };
}

/**
 * Every one of these swallows its error. A till whose browser refuses local
 * storage — private mode, a locked-down device — must still be able to pair a
 * printer by hand and print all day. It just won't remember overnight.
 */
export function rememberPrinter(station: PrinterStation, printer: RememberedPrinter): void {
  try {
    localStorage.setItem(printerKey(station), JSON.stringify(printer));
  } catch {
    /* storage unavailable — pairing still works for this session */
  }
}

export function recallPrinter(station: PrinterStation): RememberedPrinter | null {
  try {
    return parseRemembered(localStorage.getItem(printerKey(station)));
  } catch {
    return null;
  }
}

export function forgetPrinter(station: PrinterStation): void {
  try {
    localStorage.removeItem(printerKey(station));
  } catch {
    /* nothing to forget */
  }
}
