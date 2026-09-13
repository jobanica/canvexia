"use client";

import { useState } from "react";
import { voidOrder, type CashierTable } from "@/server/orders/cashier";
import { VOID_REASONS } from "@/lib/orders/void-reasons";

/** PIN prompt to authorize voiding an unpaid order. */
export function VoidPinModal({
  orderId,
  label,
  onClose,
  onVoided,
}: {
  orderId: string;
  label: string;
  onClose: () => void;
  onVoided: (tables: CashierTable[]) => void;
}) {
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await voidOrder(orderId, pin, reason);
      if (res.ok) {
        if (res.tables) onVoided(res.tables);
        onClose();
      } else {
        setError(res.error ?? "Could not void the order.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xs rounded-tile bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold">Void order</h2>
          <button onClick={onClose} className="text-plum-ink/40 hover:text-plum-ink">✕</button>
        </div>
        <p className="mb-3 text-sm text-plum-ink/55">
          Voiding <span className="font-semibold text-plum-ink">{label}</span>. Pick a reason and enter
          the manager void PIN.
        </p>
        <label className="mb-1 block text-xs font-semibold text-plum-ink/60">Reason</label>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mb-3 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
        >
          <option value="">Select a reason…</option>
          {VOID_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && pin && reason && submit()}
          placeholder="Manager PIN"
          className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-center tracking-[0.4em]"
        />
        {error && <p className="mt-2 text-sm text-guava">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-full border border-plum-ink/15 py-2.5 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !pin || !reason}
            className="flex-1 rounded-full bg-guava py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Voiding…" : "Void order"}
          </button>
        </div>
      </div>
    </div>
  );
}
