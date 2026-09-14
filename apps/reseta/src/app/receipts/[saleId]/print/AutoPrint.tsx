"use client";

import { useEffect } from "react";

/**
 * Open the print dialog on arrival.
 *
 * Opt-in, never automatic on a plain visit: the counter links here with
 * `?auto=1` after a sale, because there the print IS the next action. Someone
 * opening a past receipt to read it is not asking to print it, and a dialog
 * that appears unbidden gets dismissed reflexively — including the time it
 * mattered.
 */
export function AutoPrint() {
  useEffect(() => {
    // A frame, so the paper is laid out before the dialog freezes it.
    const id = requestAnimationFrame(() => window.print());
    return () => cancelAnimationFrame(id);
  }, []);

  return null;
}

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
    >
      Print
    </button>
  );
}
