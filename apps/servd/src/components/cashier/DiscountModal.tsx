"use client";

import { useState } from "react";
import { formatPeso } from "@/lib/money";
import { computeDiscount, netTotal, type DiscountKind } from "@/lib/discount";
import { applyDiscount, type CashierTable } from "@/server/orders/cashier";

const PRESETS: { kind: DiscountKind; label: string }[] = [
  { kind: "senior", label: "Senior Citizen (20%)" },
  { kind: "pwd", label: "PWD (20%)" },
  { kind: "percent", label: "Custom %" },
  { kind: "amount", label: "Custom ₱" },
];

export function DiscountModal({
  order,
  onClose,
  onApplied,
}: {
  order: { id: string; total: number; discountAmount: number; discountLabel: string | null };
  onClose: () => void;
  onApplied: (tables: CashierTable[]) => void;
}) {
  const [kind, setKind] = useState<DiscountKind>("senior");
  const [value, setValue] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numValue = Number(value) || 0;
  const preview = computeDiscount(order.total, kind, numValue);
  const net = netTotal(order.total, preview.amount);

  async function run(k: DiscountKind, v?: number) {
    setBusy(true);
    setError(null);
    const res = await applyDiscount(order.id, k, v);
    setBusy(false);
    if (res.ok && res.tables) {
      onApplied(res.tables);
      onClose();
    } else {
      setError(res.error ?? "Couldn't apply the discount.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-t-tile bg-white p-5 sm:rounded-tile"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold">Apply discount</h2>
          <button onClick={onClose} className="text-2xl leading-none text-plum-ink/40" aria-label="Close">
            ×
          </button>
        </div>
        <p className="mt-1 text-sm text-plum-ink/55">Subtotal {formatPeso(order.total)}</p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.kind}
              onClick={() => setKind(p.kind)}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                kind === p.kind ? "border-brand-primary bg-brand-primary/10 text-brand-primary" : "border-plum-ink/15"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {(kind === "percent" || kind === "amount") && (
          <input
            type="number"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={kind === "percent" ? "Percent off (e.g. 10)" : "Amount off in ₱ (e.g. 50)"}
            className="mt-3 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
            autoFocus
          />
        )}

        <div className="mt-4 rounded-lg bg-cream/60 p-3 text-sm">
          <div className="flex justify-between">
            <span>Discount</span>
            <span className="font-semibold text-guava">−{formatPeso(preview.amount)}</span>
          </div>
          <div className="mt-1 flex justify-between font-heading text-base font-bold">
            <span>Total due</span>
            <span>{formatPeso(net)}</span>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-guava">{error}</p>}

        <div className="mt-4 flex gap-2">
          {order.discountAmount > 0 && (
            <button
              onClick={() => run("none")}
              disabled={busy}
              className="rounded-full border border-plum-ink/15 px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              Remove
            </button>
          )}
          <button
            onClick={() => run(kind, numValue)}
            disabled={busy || preview.amount <= 0}
            className="flex-1 rounded-full py-2.5 text-sm font-semibold btn-brand disabled:opacity-50"
          >
            {busy ? "Applying…" : "Apply discount"}
          </button>
        </div>
      </div>
    </div>
  );
}
