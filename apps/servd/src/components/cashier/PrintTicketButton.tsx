"use client";

import { useState } from "react";
import { printOrderTicket, printPaidTicket } from "@/server/printing/print";
import { runPrintDispatch } from "@/lib/print/run-dispatch";

/**
 * Prints the order's paper. Before payment it prints the BILL (amount due);
 * once the order is paid it prints the official RECEIPT (with the PAID line),
 * so the cashier can always re-print the right document. Uses the shared
 * dispatch runner so both print the same way.
 */
export function PrintTicketButton({ orderId, paid = false }: { orderId: string; paid?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handlePrint() {
    setBusy(true);
    setMsg(null);
    try {
      const res = paid ? await printPaidTicket(orderId) : await printOrderTicket(orderId);
      if (!res.ok && res.message) {
        setMsg(res.message);
        return;
      }
      const m = await runPrintDispatch(res, orderId, paid ? "receipt" : "bill");
      if (m) setMsg(m);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Print failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={handlePrint}
        disabled={busy}
        className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
      >
        {busy ? "Printing…" : paid ? "Print receipt" : "Print bill"}
      </button>
      {msg && <span className="text-xs text-plum-ink/50">{msg}</span>}
    </span>
  );
}
