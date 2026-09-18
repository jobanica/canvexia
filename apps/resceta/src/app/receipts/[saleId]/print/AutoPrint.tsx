"use client";

import { useEffect, useRef } from "react";

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
  const fired = useRef(false);

  useEffect(() => {
    /*
      ONCE. React invokes an effect twice under StrictMode, and two print
      dialogs for one sale means either two copies of the receipt or a cashier
      dismissing the second one out of reflex.
    */
    if (fired.current) return;
    fired.current = true;

    let cancelled = false;
    /*
      WAIT FOR THE FONTS.

      `print()` freezes the page as it is at that instant. Called before the
      webfont has loaded, the receipt is measured in the fallback face and the
      columns on a 58mm roll do not line up — the total lands in a different
      place from the figures above it. `document.fonts.ready` is the signal for
      exactly this, and the rAF after it lets the final layout settle.

      Wrapped in a resolved promise so a browser without `document.fonts` still
      prints rather than silently skipping.
    */
    const ready = document.fonts?.ready ?? Promise.resolve();
    ready
      .catch(() => {})
      .then(() => {
        if (cancelled) return;
        requestAnimationFrame(() => {
          if (!cancelled) window.print();
        });
      });

    return () => {
      cancelled = true;
    };
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
