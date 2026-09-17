"use client";

import { useActionState, useMemo, useState } from "react";
import { voidSaleAction, returnAction, type ReversalState } from "../actions";
import { peso } from "@/lib/money";

const IDLE: ReversalState = { status: "idle" };

export interface ReversalLine {
  saleItemId: string;
  productName: string;
  generic: string | null;
  lotNumber: string | null;
  quantity: number;
  alreadyReturned: number;
  unitPriceCentavos: number;
}

/**
 * Voiding: one button and a reason.
 *
 * Deliberately not a "are you sure?" dialog with a confirm. The reason field IS
 * the friction — you cannot void without saying why, and what you type lands on
 * the movement rows, which is the thing anyone looking at this later actually
 * needs.
 */
export function VoidForm({ saleId, receiptNumber }: { saleId: string; receiptNumber: string }) {
  const [state, action, pending] = useActionState(voidSaleAction, IDLE);

  if (state.status === "done") {
    return (
      <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
        {state.message}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-lg border border-red-500/30 bg-red-500/10/40 p-4">
      <input type="hidden" name="saleId" value={saleId} />
      <p className="text-sm text-slate-200">
        Voiding {receiptNumber} puts every unit back in the batch it came from
        and marks the receipt void. Use it for a sale that should not have
        happened — rung up twice, wrong customer. If the customer is bringing
        something back, take a return instead.
      </p>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-300">Reason</span>
        <input
          name="reason"
          required
          maxLength={200}
          placeholder="Rung up twice"
          className="w-full rounded border border-white/15 px-2 py-1.5"
        />
      </label>
      {state.status === "error" && (
        <p role="alert" className="rounded border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-200">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {pending ? "Voiding…" : "Void this receipt"}
      </button>
    </form>
  );
}

/**
 * Taking a return.
 *
 * "Put back on the shelf" is off by default and labelled with why. A dispensed
 * medicine that has left the premises cannot be resold — nobody can verify how
 * it was stored — so the ordinary outcome of a return is a write-off, and
 * restocking is the exception someone chooses.
 */
export function ReturnForm({
  saleId,
  lines,
  canRestock,
}: {
  saleId: string;
  lines: ReversalLine[];
  canRestock: boolean;
}) {
  const [state, action, pending] = useActionState(returnAction, IDLE);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [restock, setRestock] = useState<Record<string, boolean>>({});

  const selected = useMemo(
    () =>
      lines
        .map((l) => ({ line: l, quantity: qty[l.saleItemId] ?? 0 }))
        .filter(({ quantity }) => quantity > 0),
    [lines, qty],
  );

  const payload = selected.map(({ line, quantity }) => ({
    saleItemId: line.saleItemId,
    quantity,
    restock: canRestock && restock[line.saleItemId] === true,
  }));

  const gross = selected.reduce(
    (sum, { line, quantity }) => sum + line.unitPriceCentavos * quantity,
    0,
  );

  if (state.status === "done") {
    return (
      <div className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
        <p>{state.message}</p>
        {state.creditNoteHref && (
          // A new tab, like the receipt: the print dialog opens over the credit
          // note and the counter stays where it was.
          <a
            href={state.creditNoteHref}
            target="_blank"
            rel="noopener"
            className="inline-block rounded bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white"
          >
            Print credit note
          </a>
        )}
      </div>
    );
  }

  const anyReturnable = lines.some((l) => l.quantity - l.alreadyReturned > 0);
  if (!anyReturnable) {
    return (
      <p className="rounded-lg border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 text-sm text-slate-300">
        Everything on this receipt has already been returned.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="saleId" value={saleId} />
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />

      <ul className="divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] backdrop-blur-xl">
        {lines.map((l) => {
          const remaining = l.quantity - l.alreadyReturned;
          const chosen = qty[l.saleItemId] ?? 0;
          return (
            <li key={l.saleItemId} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{l.productName}</p>
                  <p className="text-sm text-slate-500">
                    {l.generic ? `${l.generic} · ` : ""}
                    lot{" "}
                    <span className="font-mono text-xs">{l.lotNumber ?? "—"}</span> ·{" "}
                    {peso(l.unitPriceCentavos)} each
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="text-slate-500">
                    {remaining} of {l.quantity} returnable
                  </p>
                  <input
                    type="number"
                    min={0}
                    max={remaining}
                    value={chosen || ""}
                    disabled={remaining === 0}
                    onChange={(e) =>
                      setQty((q) => ({
                        ...q,
                        [l.saleItemId]: Math.min(
                          remaining,
                          Math.max(0, Number.parseInt(e.target.value || "0", 10)),
                        ),
                      }))
                    }
                    className="mt-1 w-24 rounded border border-white/15 px-2 py-1.5 text-right tabular-nums disabled:bg-white/10"
                    aria-label={`Quantity to return of ${l.productName}`}
                  />
                </div>
              </div>

              {chosen > 0 && canRestock && (
                <label className="mt-2 flex items-start gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={restock[l.saleItemId] === true}
                    onChange={(e) =>
                      setRestock((r) => ({ ...r, [l.saleItemId]: e.target.checked }))
                    }
                    className="mt-0.5"
                  />
                  <span>
                    Put back on the shelf, into lot{" "}
                    <span className="font-mono">{l.lotNumber ?? "—"}</span>.{" "}
                    <strong>Only if it never left the counter.</strong> A
                    dispensed medicine cannot be resold — storage and tampering
                    can&apos;t be verified — so the default is to write it off.
                  </span>
                </label>
              )}
            </li>
          );
        })}
      </ul>

      <div className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-300">Reason</span>
          <input
            name="reason"
            maxLength={200}
            placeholder="Wrong item, customer changed mind…"
            className="w-full rounded border border-white/15 px-2 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-300">Refund by</span>
          <select
            name="refundMethod"
            className="w-full rounded border border-white/15 px-2 py-1.5"
          >
            <option value="cash">Cash</option>
            <option value="gcash">GCash</option>
            <option value="maya">Maya</option>
            <option value="card">Card</option>
            <option value="store_credit">Store credit</option>
          </select>
        </label>
      </div>

      {gross > 0 && (
        <p className="text-sm text-slate-300">
          Returning {peso(gross)} at the prices charged. The refund is prorated
          by what was actually paid, so a discounted sale refunds the discounted
          amount — the exact figure is on the credit note.
        </p>
      )}

      {state.status === "error" && (
        <p role="alert" className="rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || payload.length === 0}
        className="rounded-md brand-gradient px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {pending ? "Recording…" : "Record return"}
      </button>
    </form>
  );
}
