"use client";

import { toCsv } from "@/lib/pharmacy/alerts";

/**
 * Print, and take it away as a file.
 *
 * The print view is the one somebody hands over; the CSV is the one an
 * accountant works in. Both are built from the rows ALREADY ON SCREEN, filtered
 * exactly as the person filtered them — a second query can disagree with the
 * table above it, and this is a record that has to match itself.
 */
const BOM = "\uFEFF";

export function LogTools({
  header,
  rows,
  filename,
}: {
  header: string[];
  rows: (string | number | null)[][];
  filename: string;
}) {
  function download() {
    const blob = new Blob([BOM + toCsv(header, rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div data-print-hide className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2 text-sm text-slate-200 hover:bg-white/10"
      >
        Print
      </button>
      <button
        type="button"
        onClick={download}
        className="rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2 text-sm text-slate-200 hover:bg-white/10"
      >
        Export CSV
      </button>
    </div>
  );
}
