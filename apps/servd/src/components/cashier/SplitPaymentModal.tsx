"use client";

import { useState } from "react";
import { recordPartialPayment, type CashierTable } from "@/server/orders/cashier";
import { printPaidTicket } from "@/server/printing/print";
import { runPrintDispatch, sendDrawerKick } from "@/lib/print/run-dispatch";
import type { CounterMethod } from "@/server/orders/cashier";
import { surchargeFor, surchargeLabel } from "@/lib/orders/surcharge";

function peso(centavos: number) {
  return `₱${(centavos / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

/** Take one tender at a time toward an order until it's fully settled. */
export function SplitPaymentModal({
  orderId,
  label,
  remaining,
  cardSurchargeBp = 0,
  onClose,
  onResult,
}: {
  orderId: string;
  label: string;
  remaining: number; // centavos still owed
  /** Card fee in basis points. The server charges it; this just shows it. */
  cardSurchargeBp?: number;
  onClose: () => void;
  onResult: (tables: CashierTable[]) => void;
}) {
  const [owed, setOwed] = useState(remaining);
  const [amount, setAmount] = useState((remaining / 100).toFixed(2));
  const [method, setMethod] = useState<CounterMethod>("cash");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter an amount.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await recordPartialPayment(orderId, value, method);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onResult(res.tables);
    if (res.settled) {
      // The final tender settles the bill, so the drawer and the receipt are
      // due here too — decided by the server from the restaurant's settings.
      if (res.drawerKickBase64) {
        try {
          await sendDrawerKick(res.drawerKickBase64);
        } catch {
          /* the money is recorded; a stuck drawer isn't worth blocking on */
        }
      }
      if (res.printTicket) {
        try {
          await runPrintDispatch(await printPaidTicket(orderId), orderId, "receipt");
        } catch {
          /* the sale is settled either way */
        }
      }
      onClose();
    } else {
      setOwed(res.remaining);
      setAmount((res.remaining / 100).toFixed(2));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xs rounded-tile bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold">Split payment</h2>
          <button onClick={onClose} className="text-plum-ink/40 hover:text-plum-ink">✕</button>
        </div>
        <p className="mb-3 text-sm text-plum-ink/55">
          <span className="font-semibold text-plum-ink">{label}</span> · <span className="font-semibold">{peso(owed)}</span> still
          owed. Record each tender; the order settles when it's covered.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span className="font-medium">Amount (₱)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Method</span>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as CounterMethod)}
              className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
            >
              <option value="cash">Cash</option>
              <option value="gcash">GCash</option>
              <option value="maya">Maya</option>
              <option value="card_terminal">Card</option>
            </select>
          </label>
        </div>

        {/* The fee lands on the card portion only, so a split bill isn't
            charged 3.5% of the whole thing. */}
        {(() => {
          const value = Number(amount);
          const base = Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0;
          const fee = surchargeFor(method, Math.min(base, owed), cardSurchargeBp);
          return fee > 0 ? (
            <p className="mt-2 rounded-lg bg-cream/60 px-3 py-2 text-sm text-plum-ink/70">
              {surchargeLabel(cardSurchargeBp)} {peso(fee)} — charge{" "}
              <strong className="text-plum-ink">{peso(Math.min(base, owed) + fee)}</strong> on the terminal.
            </p>
          ) : null;
        })()}

        {error && <p className="mt-2 text-sm text-guava">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-full border border-plum-ink/15 py-2.5 text-sm font-semibold">
            Done
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="flex-1 rounded-full py-2.5 text-sm font-semibold text-white btn-brand disabled:opacity-60"
          >
            {busy ? "Recording…" : "Record tender"}
          </button>
        </div>
      </div>
    </div>
  );
}
