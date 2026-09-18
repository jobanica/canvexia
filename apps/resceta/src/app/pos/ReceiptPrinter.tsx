"use client";

import { useEffect, useRef, useState } from "react";

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

  useEffect(() => {
    // One print per sale. Without this, a re-render after the sale — a totals
    // recount, a React double-invoke — sends a second copy through the printer.
    if (printed.current === jobId) return;
    printed.current = jobId;
    setFailed(false);

    // If the frame has not printed within ten seconds the roll is not coming,
    // and the cashier needs the button rather than a silent nothing.
    const giveUp = window.setTimeout(() => setFailed(true), 10_000);
    return () => window.clearTimeout(giveUp);
  }, [jobId]);

  if (!jobId) return null;

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
