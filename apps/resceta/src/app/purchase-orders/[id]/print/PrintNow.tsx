"use client";

import { useEffect, useRef } from "react";

/**
 * Open the print dialog, once.
 *
 * `auto` is opt-in from the order page's Print button, never automatic on a
 * plain visit: somebody opening a past order to read it is not asking to print
 * it, and a dialog that appears unbidden gets dismissed by reflex — including
 * the time it mattered.
 */
export function PrintNow({ auto }: { auto: boolean }) {
  const fired = useRef(false);

  useEffect(() => {
    if (!auto || fired.current) return;
    fired.current = true;
    let cancelled = false;
    // print() freezes the page as it is; waiting for the fonts keeps the
    // columns lined up with the totals underneath them.
    const ready = document.fonts?.ready ?? Promise.resolve();
    ready.catch(() => {}).then(() => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        if (!cancelled) window.print();
      });
    });
    return () => {
      cancelled = true;
    };
  }, [auto]);

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
