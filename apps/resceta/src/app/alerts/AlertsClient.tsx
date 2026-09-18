"use client";

import { useActionState, useMemo, useState } from "react";
import { peso } from "@/lib/money";
import { toCsv } from "@/lib/pharmacy/alerts";
import { writeOffExpired, saveAlertWindow, type AlertActionState } from "./actions";

const IDLE: AlertActionState = { status: "idle" };

/**
 * The UTF-8 byte-order mark, as an ESCAPE rather than the character itself.
 *
 * Written literally it is an invisible character in the source that a tidy
 * editor, a linter or a copy-paste will silently eat — and its absence is not
 * visible until a pharmacist opens the export and finds the peso column full of
 * mojibake.
 */
const BOM = "\uFEFF";

/**
 * The parts of the alerts screen that need the browser: downloading a file,
 * opening the print dialog, and the two buttons that write.
 *
 * Everything else on that page is server-rendered, including the tab you are
 * on — a tab in the URL is a tab somebody can bookmark, reload, and send to
 * the person who actually orders the stock.
 */

/**
 * EXPORT WHAT IS ON SCREEN, not what is in the database.
 *
 * The rows are already here, filtered exactly as the person filtered them. Any
 * other source is a second query that can disagree with the table above it —
 * and somebody orders from the file, not from the screen.
 */
export function ExportCsv({
  header,
  rows,
  filename,
}: {
  header: string[];
  rows: (string | number | null)[][];
  filename: string;
}) {
  const [done, setDone] = useState(false);

  function download() {
    // Excel needs the BOM to read the file as UTF-8. Without it the peso sign
    // and the "less than or equal" in the bucket labels arrive as mojibake, on
    // exactly the machine most likely to open this.
    const blob = new Blob([BOM + toCsv(header, rows)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setDone(true);
    window.setTimeout(() => setDone(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={download}
      data-print-hide
      className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2 text-sm text-slate-200 hover:bg-white/10"
    >
      {done ? "Downloaded" : "Export CSV"}
    </button>
  );
}

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      data-print-hide
      className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2 text-sm text-slate-200 hover:bg-white/10"
    >
      Print
    </button>
  );
}

/** How far ahead the expiry alert looks. */
export function AlertWindow({ days }: { days: number }) {
  const [state, action, pending] = useActionState(saveAlertWindow, IDLE);

  return (
    <form
      action={action}
      data-print-hide
      className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4"
    >
      <label className="flex flex-wrap items-center gap-3 text-sm text-slate-200">
        Alert me for stock expiring within
        <input
          name="expiryAlertDays"
          type="text"
          inputMode="numeric"
          defaultValue={String(days)}
          aria-label="Days ahead to alert"
          className="w-24 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-center text-sm text-white"
        />
        days
      </label>
      <button
        disabled={pending}
        className="rounded-xl brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {state.status === "error" && <span className="text-sm text-rose-300">{state.message}</span>}
      {state.status === "done" && (
        <span className="text-sm text-emerald-300">{state.message}</span>
      )}
    </form>
  );
}

/**
 * Write off one expired batch.
 *
 * ASKS FIRST. This destroys stock and writes a movement that cannot be undone
 * from the UI, and it sits at the end of a row in a list of a hundred — a
 * misplaced click here is a real loss in the books.
 */
export function WriteOffButton({
  batchId,
  quantity,
  productName,
  unit,
}: {
  batchId: string;
  quantity: number;
  productName: string;
  unit: string;
}) {
  const [state, action, pending] = useActionState(writeOffExpired, IDLE);

  if (state.status === "done") {
    return <span className="text-xs text-emerald-300">Written off</span>;
  }

  return (
    <form
      action={action}
      data-print-hide
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Write off all ${quantity} ${unit} of ${productName}?\n\nThis takes the stock off the shelf and records the loss. It cannot be undone here.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="quantity" value={quantity} />
      <button
        disabled={pending}
        className="text-xs font-medium text-rose-300 underline hover:text-rose-200 disabled:opacity-40"
      >
        {pending ? "Writing off…" : "Write off"}
      </button>
      {state.status === "error" && (
        <span className="block text-xs text-rose-300">{state.message}</span>
      )}
    </form>
  );
}

/** The money a list has sitting in it, when the reader is allowed to see it. */
export function TiedUp({ centavos, count }: { centavos: number; count: number }) {
  const label = useMemo(() => `${count} item${count === 1 ? "" : "s"}`, [count]);
  return (
    <p className="text-sm text-slate-300">
      {label} · tied-up value <strong className="text-white">{peso(centavos)}</strong>
    </p>
  );
}
