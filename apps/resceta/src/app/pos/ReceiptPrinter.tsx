"use client";

import { useEffect, useRef, useState } from "react";
import { connect, savedMethod, sendToHelper } from "@/lib/pharmacy/printer-link";

/**
 * PRINT THE RECEIPT WHEN THE SALE SETTLES.
 *
 * REPORTED — "i tried the sale, i dont see receipt printing it. it should auto
 * print."
 *
 * The print page has taken `?auto=1` since it was written, and its own comment
 * says "the counter links here with ?auto=1 after a sale". The counter never
 * did: it rendered a link to the receipt and waited to be clicked. The
 * mechanism existed and nothing drove it.
 *
 * AN OFF-SCREEN FRAME, NOT A NAVIGATION. Sending the cashier to the print page
 * takes the counter away between customers, and the queue does not stop for the
 * back button. The frame loads the same print page, prints itself, and the till
 * never moves.
 *
 * WHY IT IS PUSHED OFF-SCREEN RATHER THAN HIDDEN. `display: none` and a
 * zero-sized frame both stop the receipt laying out — a thermal roll rendered
 * at zero width prints as a column of single characters, when it prints at all.
 * It keeps a real width and sits where nobody can see it.
 */
export function ReceiptPrinter({
  jobId,
  src,
  paperMm,
  label = "Print the receipt",
}: {
  /**
   * Changes with every document, which is what re-arms the frame. A sale id or
   * a Z-reading id — this component does not care which, it cares that the
   * value is different from the last one it printed.
   */
  jobId: string;
  /** The print page to load. Already carries ?auto=1. */
  src: string;
  paperMm: number;
  label?: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const printed = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [direct, setDirect] = useState(false);
  const [auto, setAuto] = useState<string | null>(null);

  useEffect(() => {
    // One print per sale. Without this, a re-render after the sale — a totals
    // recount, a React double-invoke — sends a second copy through the printer.
    if (printed.current === jobId) return;
    printed.current = jobId;
    setFailed(false);

    /*
      A TILL SET TO A DIRECT PRINTER MUST NOT ALSO OPEN THE DIALOG.

      The frame below is the dialog path. When this device is wired straight to
      a Bluetooth or USB printer, loading it would put a print dialog in front
      of the cashier on every single sale — on top of the receipt that already
      came out.

      The direct send cannot happen here: Web Bluetooth and WebUSB require a
      user gesture, and a completed sale is not one. So the frame is suppressed
      and the button below is offered instead, which IS a gesture.
    */
    const method = savedMethod();

    /*
      THE HELPER PRINTS ON ITS OWN, which is the whole reason it exists.

      Bluetooth and USB need a user gesture — the browser cannot tell a finished
      sale from a page helping itself to the hardware — so those get a button.
      The helper is an ordinary fetch to a program the pharmacy chose to run, so
      no gesture is required and the receipt comes out with nobody touching
      anything.
    */
    if (method === "helper") {
      let cancelled = false;
      (async () => {
        try {
          const type = src.includes("/readings/") ? "reading" : "receipt";
          const res = await fetch(
            `/api/escpos?type=${type}&id=${encodeURIComponent(jobId)}`,
          );
          if (!res.ok) throw new Error(await res.text());
          await sendToHelper(new Uint8Array(await res.arrayBuffer()));
          if (!cancelled) setAuto("sent");
        } catch (e) {
          // Never silent. A receipt that did not print and said nothing is a
          // customer walking out without one.
          if (!cancelled) setAuto(e instanceof Error ? e.message : "The helper did not answer.");
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    if (method !== "dialog") {
      setDirect(true);
      return;
    }

    // If the frame has not printed within ten seconds the roll is not coming,
    // and the cashier needs the button rather than a silent nothing.
    const giveUp = window.setTimeout(() => setFailed(true), 10_000);
    return () => window.clearTimeout(giveUp);
  }, [jobId]);

  if (!jobId) return null;

  if (auto) {
    return auto === "sent" ? (
      <p className="mt-2 text-xs text-emerald-300">Printed.</p>
    ) : (
      <div className="mt-2">
        <p className="text-xs text-rose-300">{auto}</p>
        {/* The fallback, because the sale is already done either way. */}
        <DirectPrintButton jobId={jobId} src={src} label={label} />
      </div>
    );
  }

  if (direct) {
    return (
      <DirectPrintButton jobId={jobId} src={src} label={label} />
    );
  }

  return (
    <>
      <iframe
        ref={frame}
        // Keyed so a second sale replaces the frame outright rather than
        // reusing one whose document has already been through the dialog.
        key={jobId}
        src={src}
        title="Print"
        aria-hidden
        tabIndex={-1}
        onLoad={() => setFailed(false)}
        style={{
          position: "fixed",
          left: "-10000px",
          top: 0,
          // Real size: the receipt has to lay out at its paper width to print
          // at its paper width.
          width: `${paperMm * 4}px`,
          height: "600px",
          border: 0,
        }}
      />
      {failed && (
        <button
          type="button"
          onClick={() => frame.current?.contentWindow?.print()}
          className="mt-2 w-full rounded-xl border border-white/15 px-4 py-2 text-xs text-slate-200"
        >
          {label}
        </button>
      )}
    </>
  );
}

/**
 * The direct path's button.
 *
 * IT HAS TO BE A BUTTON. Web Bluetooth and WebUSB both refuse outside a user
 * gesture, and a completed sale is not one — the browser cannot tell it from a
 * page deciding to reach for the hardware on its own. So a till wired straight
 * to a printer gets one tap per sale rather than a print dialog per sale, which
 * is still one fewer thing than the dialog asks for.
 */
function DirectPrintButton({
  jobId,
  src,
  label,
}: {
  jobId: string;
  src: string;
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [bad, setBad] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setBad(null);
    try {
      // The server renders the document; this only pushes the bytes. The URL
      // carries the same id the dialog path would have loaded.
      const url = new URL(src, window.location.origin);
      const type = url.pathname.includes("/readings/") ? "reading" : "receipt";
      const res = await fetch(`/api/escpos?type=${type}&id=${encodeURIComponent(jobId)}`);
      if (!res.ok) throw new Error(await res.text());
      const bytes = new Uint8Array(await res.arrayBuffer());

      const link = await connect(savedMethod());
      await link.send(bytes);
      setSent(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setBad(
        /cancel|No device selected|chooser/i.test(msg)
          ? "No printer was chosen."
          : msg || "Could not reach the printer.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (sent) return <p className="mt-2 text-xs text-emerald-300">Sent to the printer.</p>;

  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={busy}
        onClick={send}
        className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2 text-xs text-slate-100 disabled:opacity-40"
      >
        {busy ? "Sending…" : label}
      </button>
      {bad && <p className="mt-1 text-xs text-rose-300">{bad}</p>}
    </div>
  );
}
