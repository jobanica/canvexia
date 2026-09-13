"use client";

import { useEffect, useState } from "react";
import {
  connectPrinter,
  disconnectPrinter,
  isBluetoothSupported,
  isPrinterPaired,
  onPrinterChange,
  printerName,
  restorePairedPrinters,
  type PrinterStation,
} from "@/lib/printing/bt-printer";
import { bluetoothHelp, isUserCancel } from "@/lib/printing/bluetooth-help";

const LABEL: Record<PrinterStation, { idle: string; live: string }> = {
  till: { idle: "🖨️ Connect printer", live: "🖨️ Printer connected" },
  kitchen: { idle: "🍳 Connect kitchen printer", live: "🍳 Kitchen printer connected" },
};

/**
 * Pair a Bluetooth printer once; afterwards it prints automatically. Shows live
 * connection status.
 *
 * Rendered twice where a restaurant runs a docket printer at the pass as well —
 * one button per station, each pairing its own device.
 */
export function BluetoothPrinterButton({
  station = "till",
  explainUnsupported = false,
}: {
  station?: PrinterStation;
  /**
   * Say why the button is missing instead of rendering nothing.
   *
   * Used for the kitchen printer: the settings page has just told them to come
   * here and pair it, so silence looks like a bug in the app rather than a
   * limitation of the browser they're using.
   */
  explainUnsupported?: boolean;
}) {
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const supported = isBluetoothSupported();

  useEffect(() => {
    setConnected(isPrinterPaired(station));
    // Ignore the other station's events, or pairing the kitchen printer would
    // light up the till's button too.
    const stop = onPrinterChange((live, which) => {
      if (which === station) setConnected(live);
    });
    // Pick the printer back up from the browser's own permission list. Pairing
    // survives closing the app; only the page's memory of it didn't, which is
    // why this used to ask to be reconnected every morning. Deduped inside, so
    // both buttons mounting is one restore.
    void restorePairedPrinters();
    return stop;
  }, [station]);

  async function connect() {
    setBusy(true);
    setErr(null);
    try {
      await connectPrinter({ station });
    } catch (e) {
      // The chooser throws when they press Cancel — they know they did that.
      // Everything else gets translated: the browser's own wording is written
      // for developers, and "Web Bluetooth API globally disabled" reads like a
      // broken app when it means the browser refused before we ever asked.
      const msg = e instanceof Error ? e.message : "Couldn't connect.";
      if (!isUserCancel(msg)) {
        setErr(bluetoothHelp(msg, typeof navigator !== "undefined" ? navigator.userAgent : "").message);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    // No Web Bluetooth: iOS/Safari at all, and Chrome on iOS too (it's Safari
    // underneath). Nothing here can pair a printer on this device.
    if (!explainUnsupported) return null;
    const which = station === "kitchen" ? "kitchen printer" : "receipt printer";
    return (
      <p className="rounded-lg bg-cream px-3 py-2 text-xs leading-relaxed text-plum-ink/60">
        <strong className="text-plum-ink/80">No Connect {which} button?</strong> This device
        can&apos;t pair one. Bluetooth printing needs Chrome or Edge on an Android tablet, a
        Windows PC or a Mac — it never works on an iPhone or iPad, in Safari, or inside the
        Facebook or Messenger browser, whatever browser you install. Either run this till on an
        Android tablet or a laptop, or set the {which} to <strong>Network</strong> or{" "}
        <strong>Cloud</strong> in Printer settings so the server drives it and no pairing is
        needed here at all.
      </p>
    );
  }

  if (connected) {
    return (
      <button
        onClick={() => disconnectPrinter(station)}
        title={printerName(station) ?? "Printer connected"}
        className="w-full rounded-full border border-mango/50 bg-mango/10 px-4 py-2.5 text-sm font-semibold text-mango"
      >
        {LABEL[station].live}
      </button>
    );
  }

  return (
    <>
      <button
        onClick={connect}
        disabled={busy}
        className="w-full rounded-full border border-plum-ink/15 bg-white px-4 py-2.5 text-sm font-semibold text-plum-ink hover:bg-cream disabled:opacity-60"
      >
        {busy ? "Connecting…" : LABEL[station].idle}
      </button>
      {err && <span className="text-xs text-guava">{err}</span>}
    </>
  );
}
