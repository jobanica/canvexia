"use client";

import { toCsv } from "@/lib/pharmacy/alerts";

/** The order as a file, for a supplier who wants a spreadsheet. */
const BOM = "\uFEFF";

export function PoExport({
  poNumber,
  header,
  rows,
}: {
  poNumber: string;
  header: string[];
  rows: (string | number | null)[][];
}) {
  return (
    <button
      type="button"
      data-print-hide
      onClick={() => {
        const blob = new Blob([BOM + toCsv(header, rows)], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `purchase-order-${poNumber}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }}
      className="rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2 text-sm text-slate-200 hover:bg-white/10"
    >
      Export CSV
    </button>
  );
}
