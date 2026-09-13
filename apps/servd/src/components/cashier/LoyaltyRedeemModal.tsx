"use client";

import { useEffect, useState } from "react";
import { formatPeso } from "@/lib/money";
import { getOrderLoyalty, redeemLoyalty, type CashierTable } from "@/server/orders/cashier";

export function LoyaltyRedeemModal({
  orderId,
  onClose,
  onApplied,
}: {
  orderId: string;
  onClose: () => void;
  onApplied: (tables: CashierTable[]) => void;
}) {
  const [info, setInfo] = useState<{ enabled: boolean; phone: string | null; points: number; pointValue: number } | null>(null);
  const [redeem, setRedeem] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOrderLoyalty(orderId).then(setInfo).catch(() => setError("Couldn't load loyalty info."));
  }, [orderId]);

  const pts = Math.min(info?.points ?? 0, Math.max(0, Math.round(Number(redeem) || 0)));
  const value = pts * (info?.pointValue ?? 0);

  async function apply() {
    setBusy(true);
    setError(null);
    const res = await redeemLoyalty(orderId, pts);
    setBusy(false);
    if (res.ok && res.tables) {
      onApplied(res.tables);
      onClose();
    } else {
      setError(res.error ?? "Couldn't redeem.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-tile bg-white p-5 sm:rounded-tile" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold">⭐ Redeem points</h2>
          <button onClick={onClose} className="text-2xl leading-none text-plum-ink/40" aria-label="Close">×</button>
        </div>

        {!info ? (
          <p className="mt-4 text-sm text-plum-ink/50">Loading…</p>
        ) : !info.enabled ? (
          <p className="mt-4 text-sm text-plum-ink/60">Loyalty isn&apos;t enabled.</p>
        ) : !info.phone ? (
          <p className="mt-4 text-sm text-plum-ink/60">
            This order has no customer phone. Ask the customer to enter their number in the app&apos;s
            Rewards section, or create the order as pickup/delivery with their phone.
          </p>
        ) : (
          <>
            <p className="mt-3 text-sm text-plum-ink/60">
              {info.phone} · <span className="font-semibold text-plum-ink">{info.points} points</span> available
            </p>
            <label className="mt-4 block text-sm font-semibold">Points to redeem</label>
            <input
              type="number"
              min={0}
              max={info.points}
              value={redeem}
              onChange={(e) => setRedeem(e.target.value)}
              className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
              autoFocus
            />
            <div className="mt-3 flex justify-between rounded-lg bg-cream/60 p-3 font-heading font-bold">
              <span>Discount</span>
              <span>{formatPeso(value)}</span>
            </div>
            {error && <p className="mt-3 text-sm text-guava">{error}</p>}
            <button
              onClick={apply}
              disabled={busy || pts <= 0}
              className="mt-4 w-full rounded-full py-2.5 text-sm font-semibold btn-brand disabled:opacity-50"
            >
              {busy ? "Redeeming…" : `Redeem ${pts} pts`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
