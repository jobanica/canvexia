"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EscPos, columnsFor } from "@/lib/pharmacy/escpos";
import {
  connect,
  helperStatus,
  savedHelper,
  saveHelper,
  savedMethod,
  saveMethod,
  sendToHelper,
  support,
  DEFAULT_HELPER_URL,
  type PrintMethod,
} from "@/lib/pharmacy/printer-link";
import { peso, manilaDate } from "@/lib/money";

/**
 * HOW THIS TILL REACHES ITS PRINTER.
 *
 * REPORTED — "it has a test print, but there is no option is it via usb or via
 * bluetooth."
 *
 * THE CHOICE BELONGS TO THIS DEVICE, not to the pharmacy, so it lives in this
 * browser rather than the database. A shop with a laptop at the front counter
 * and a tablet at the back has two printers connected two different ways; one
 * setting shared between them would make one of the two wrong.
 *
 * WHAT THE BROWSER CANNOT DO IS SAID OUT LOUD. Web Bluetooth and WebUSB do not
 * exist in Safari — every iPhone and iPad — so the option is shown disabled
 * with the reason, rather than offered and then failing in front of a customer.
 */
export function PrinterPanel({
  shopName,
  address,
  paperMm,
  footer,
}: {
  shopName: string;
  address: string | null;
  paperMm: number;
  footer: string | null;
}) {
  const [method, setMethod] = useState<PrintMethod>("dialog");
  const [can, setCan] = useState({ bluetooth: false, usb: false, secure: false });
  const [busy, setBusy] = useState(false);
  const [helper, setHelper] = useState({ url: DEFAULT_HELPER_URL, token: "" });
  const [found, setFound] = useState<boolean | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [bad, setBad] = useState<string | null>(null);

  // Read AFTER mount: localStorage and `navigator.bluetooth` do not exist on
  // the server, and reading them during render would not match the HTML.
  useEffect(() => {
    setMethod(savedMethod());
    setCan(support());
    setHelper(savedHelper());
  }, []);

  // Look for a running bridge whenever the address changes, so the page can
  // say "found it" before anybody pastes a token.
  useEffect(() => {
    if (method !== "helper") return;
    let live = true;
    setFound(null);
    helperStatus(helper.url).then((ok) => live && setFound(ok));
    return () => {
      live = false;
    };
  }, [method, helper.url]);

  function choose(m: PrintMethod) {
    setMethod(m);
    saveMethod(m);
    setNote(null);
    setBad(null);
  }

  /** The same slip the dialog path prints, as bytes. */
  function testBytes(): Uint8Array {
    const w = columnsFor(paperMm);
    const p = new EscPos().init().align("center").bold(true);
    p.line(shopName);
    p.bold(false);
    if (address) p.line(address);
    p.feed(1).bold(true).line("*** TEST PRINT ***").bold(false);
    p.line("NOT A RECEIPT - NOT A SALE");
    p.align("left").rule(w);
    p.line(manilaDate(new Date()));
    p.line(`Paper set to ${paperMm}mm - ${w} columns`);
    p.rule(w);
    p.row("Sample item 500mg", peso(12345), w);
    p.row("  2 x " + peso(6172), "", w);
    p.row("A longer product name to test wrapping", peso(98700), w);
    p.rule(w);
    p.bold(true).row("TOTAL", peso(111045), w).bold(false);
    p.rule(w);
    p.align("center").line("1234567890 ABCDEFGHIJ");
    p.line("The quick brown fox jumps over");
    if (footer) p.line(footer);
    p.feed(1).bold(true).line("*** END OF TEST ***");
    return p.cut().bytes();
  }

  async function testDirect() {
    setBusy(true);
    setNote(null);
    setBad(null);
    try {
      // The picker MUST open from this click; both APIs refuse otherwise, and
      // the refusal looks exactly like a broken printer.
      const link = await connect(method);
      await link.send(testBytes());
      setNote(`Sent to ${link.name}. If nothing came out, the printer is paired but not listening.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setBad(
        /cancel|No device selected|chooser/i.test(msg)
          ? "No printer was chosen."
          : msg || "Could not reach that printer.",
      );
    } finally {
      setBusy(false);
    }
  }

  const options: { value: PrintMethod; label: string; blurb: string; ok: boolean; why?: string }[] = [
    {
      value: "dialog",
      label: "Print dialog",
      blurb:
        "Goes to whichever printer this device already has, through the browser's own dialog. Works everywhere, but somebody has to set the paper size and press Print.",
      ok: true,
    },
    {
      value: "bluetooth",
      label: "Bluetooth",
      blurb:
        "Straight to a paired Bluetooth thermal printer, no dialog. Pair the printer in this device's Bluetooth settings first.",
      ok: can.bluetooth && can.secure,
      why: !can.bluetooth
        ? "This browser has no Bluetooth printing — Safari on iPhone and iPad never does. Use Chrome or Edge."
        : !can.secure
          ? "Only available over https."
          : undefined,
    },
    {
      value: "helper",
      label: "Helper app  —  prints on its own",
      blurb:
        "A small program running on this till. The ONLY option that prints without anybody pressing anything, because it is not the browser reaching for hardware. Works with any printer the till has, including USB and Bluetooth.",
      ok: true,
    },
    {
      value: "usb",
      label: "USB",
      blurb:
        "Straight to a USB thermal printer, no dialog. Plug it in, then choose it once — this browser remembers it.",
      ok: can.usb && can.secure,
      why: !can.usb
        ? "This browser has no USB printing — Safari on iPhone and iPad never does. Use Chrome or Edge."
        : !can.secure
          ? "Only available over https."
          : undefined,
    },
  ];

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-sm font-semibold text-white">How this till reaches its printer</p>
      <p className="mt-1 text-xs text-slate-400">
        Saved on <strong>this device only</strong> — the tablet at the back counter
        keeps its own setting.
      </p>

      <div className="mt-3 space-y-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={`flex items-start gap-3 rounded-xl border p-3 ${
              method === o.value
                ? "border-violet-400/50 bg-violet-500/10"
                : "border-white/10 bg-white/[0.03]"
            } ${o.ok ? "cursor-pointer" : "opacity-60"}`}
          >
            <input
              type="radio"
              name="printMethod"
              checked={method === o.value}
              disabled={!o.ok}
              onChange={() => choose(o.value)}
              className="mt-0.5 h-4 w-4"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-white">{o.label}</span>
              <span className="mt-0.5 block text-xs text-slate-300">{o.blurb}</span>
              {/* The reason, not a greyed-out button with no explanation. */}
              {!o.ok && o.why && (
                <span className="mt-1 block text-xs text-amber-300">{o.why}</span>
              )}
            </span>
          </label>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {method === "dialog" ? (
          <Link
            href="/settings/test-print?auto=1"
            target="_blank"
            className="rounded-xl brand-gradient px-4 py-2 text-sm font-semibold text-white"
          >
            Send a test print
          </Link>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={testDirect}
            className="rounded-xl brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy
              ? "Sending…"
              : method === "helper"
                ? "Send a test print"
                : `Choose the ${method === "usb" ? "USB" : "Bluetooth"} printer and test`}
          </button>
        )}
      </div>

      {method === "helper" && (
        <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400">Bridge</span>
            {found === null ? (
              <span className="text-slate-400">looking…</span>
            ) : found ? (
              <span className="text-emerald-300">running</span>
            ) : (
              <span className="text-amber-300">not running on {helper.url}</span>
            )}
          </div>
          <label className="block text-xs text-slate-400">
            Address
            <input
              value={helper.url}
              onChange={(e) => {
                const next = { ...helper, url: e.target.value };
                setHelper(next);
                saveHelper(next);
              }}
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Token
            {/*
              Typed, not generated here. The bridge prints it in its own window
              on first run — which is what proves the person setting this up is
              actually at the till, rather than a page that found the port.
            */}
            <input
              value={helper.token}
              onChange={(e) => {
                const next = { ...helper, token: e.target.value };
                setHelper(next);
                saveHelper(next);
              }}
              placeholder="paste the token the helper printed"
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 font-mono text-xs text-white"
            />
          </label>
          {!found && (
            <p className="text-xs text-slate-400">
              Start it on this computer with <code>node src/index.mjs</code>, then
              leave the window open.
            </p>
          )}
        </div>
      )}

      {note && <p className="mt-2 text-xs text-emerald-300">{note}</p>}
      {bad && <p className="mt-2 text-xs text-rose-300">{bad}</p>}

      {method === "dialog" && (
        <p className="mt-2 text-xs text-slate-400">
          In the dialog: choose your roll size rather than A4, turn headers and
          footers off, and set margins to none.
        </p>
      )}
      {(method === "bluetooth" || method === "usb") && (
        <p className="mt-2 text-xs text-slate-400">
          {/*
            The permission is per browser AND per device, and it is asked once.
            Somebody who declines it sees nothing happen and needs to know why.
          */}
          You pick the printer once and this browser remembers it. If the picker
          shows nothing, the printer is not paired or plugged in yet.
        </p>
      )}
    </div>
  );
}
