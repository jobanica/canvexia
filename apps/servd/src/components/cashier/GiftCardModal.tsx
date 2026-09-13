"use client";

import { useState } from "react";
import { applyGiftCard } from "@/server/gift-cards/gift-cards";
import type { CashierTable } from "@/server/orders/cashier";

function peso(centavos: number) {
  return `₱${(centavos / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

/** Redeem a gift card against an open order. */
export function GiftCardModal({
  orderId,
  label,
  onClose,
  onApplied,
}: {
  orderId: string;
  label: string;
  onClose: () => void;
  onApplied: (tables: CashierTable[]) => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    const res = await applyGiftCard(orderId, code);
    if (res.ok) {
      onApplied(res.tables);
      onClose();
    } else {
      setError(res.error);
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xs rounded-tile bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold">Redeem gift card</h2>
          <button onClick={onClose} className="text-plum-ink/40 hover:text-plum-ink">✕</button>
        </div>
        <p className="mb-3 text-sm text-plum-ink/55">
          Applying to <span className="font-semibold text-plum-ink">{label}</span>. The card covers up
          to the amount due.
        </p>
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && code && submit()}
          placeholder="Gift card code"
          className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-center font-mono tracking-wider"
        />
        {error && <p className="mt-2 text-sm text-guava">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-full border border-plum-ink/15 py-2.5 text-sm font-semibold">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !code.trim()}
            className="flex-1 rounded-full py-2.5 text-sm font-semibold text-white btn-brand disabled:opacity-60"
          >
            {busy ? "Applying…" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
