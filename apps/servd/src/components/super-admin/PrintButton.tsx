"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-full px-4 py-2 text-sm font-semibold btn-brand text-white print:hidden"
    >
      Print / Save PDF
    </button>
  );
}
