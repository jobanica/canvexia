"use client";

/**
 * Print, which on every browser worth the name also means "save as PDF".
 *
 * A client component for one `window.print()`, rather than a PDF dependency on
 * the server: the output is identical, it works on the phone a shop owner
 * actually has, and it adds nothing to install.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="min-h-[44px] rounded-full border border-plum-ink/15 px-5 text-sm font-semibold text-plum-ink/70"
    >
      Print or save as PDF
    </button>
  );
}
