"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { recordCashOut, getCashOuts, type CashOutState, type CashOutRow } from "@/server/orders/cash-out";
import { formatPeso } from "@/lib/money";

/** Record cash removed from the drawer (e.g. the owner taking money). */
export function CashOutModal({ onClose }: { onClose: () => void }) {
  const [state, action, pending] = useActionState<CashOutState, FormData>(recordCashOut, null);
  const [rows, setRows] = useState<CashOutRow[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  const load = () => getCashOuts().then(setRows).catch(() => setRows([]));
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      load();
    }
  }, [state]);

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const input = "w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-sm flex-col rounded-tile bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold">Cash out</h2>
          <button onClick={onClose} className="text-plum-ink/40 hover:text-plum-ink">✕</button>
        </div>
        <p className="mb-3 text-sm text-plum-ink/55">
          Record money taken from the drawer (e.g. the owner collecting cash). It&apos;s subtracted
          from the expected cash in your end-of-shift summary.
        </p>

        <form ref={formRef} action={action} className="space-y-2">
          <input name="amount" type="number" min="1" step="0.01" placeholder="Amount (₱)" className={input} autoFocus />
          <input name="note" type="text" maxLength={120} placeholder="Note (e.g. owner withdrawal)" className={input} />
          <button
            disabled={pending}
            className="w-full rounded-full py-2.5 text-sm font-semibold btn-brand disabled:opacity-60"
          >
            {pending ? "Recording…" : "Record cash-out"}
          </button>
          {state?.error && <p className="text-sm text-guava">{state.error}</p>}
          {state?.ok && <p className="text-sm text-mango">{state.message}</p>}
        </form>

        {rows.length > 0 && (
          <div className="mt-4 overflow-y-auto border-t border-plum-ink/10 pt-3">
            <div className="mb-1 flex items-center justify-between text-xs font-semibold text-plum-ink/50">
              <span>Today&apos;s cash-outs</span>
              <span>{formatPeso(total)}</span>
            </div>
            <div className="space-y-1.5">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm">
                  <span className="text-plum-ink/70">
                    {r.note || "Cash out"}
                    <span className="ml-1 text-xs text-plum-ink/40">
                      {new Date(r.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                  <span className="font-semibold">{formatPeso(r.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
