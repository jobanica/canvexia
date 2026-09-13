"use client";

import { useEffect, useState } from "react";
import {
  getOrderItems,
  voidOrderItem,
  type CashierTable,
  type EditableItem,
} from "@/server/orders/cashier";
import { VOID_REASONS } from "@/lib/orders/void-reasons";

function peso(centavos: number) {
  return `₱${(centavos / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

/**
 * Manager edit of an unpaid order — void individual line items. Each removal
 * needs a reason + the void PIN; the server recomputes the total and logs it.
 */
export function EditOrderModal({
  orderId,
  label,
  onClose,
  onChanged,
}: {
  orderId: string;
  label: string;
  onClose: () => void;
  onChanged: (tables: CashierTable[]) => void;
}) {
  const [items, setItems] = useState<EditableItem[] | "loading">("loading");
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getOrderItems(orderId)
      .then((rows) => setItems(rows))
      .catch(() => setItems([]));
  }, [orderId]);

  async function removeItem(itemId: string) {
    if (!pin || !reason) {
      setError("Pick a reason and enter the manager PIN first.");
      return;
    }
    setBusy(true);
    setError(null);
    setPendingId(itemId);
    const res = await voidOrderItem(orderId, itemId, pin, reason);
    if (res.ok) {
      if (res.tables) onChanged(res.tables);
      const next = await getOrderItems(orderId);
      setItems(next);
      if (next.length === 0) onClose(); // order fully voided
    } else {
      setError(res.error ?? "Could not edit the order.");
    }
    setPendingId(null);
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-tile bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold">Edit order</h2>
          <button onClick={onClose} className="text-plum-ink/40 hover:text-plum-ink">✕</button>
        </div>
        <p className="mb-3 text-sm text-plum-ink/55">
          <span className="font-semibold text-plum-ink">{label}</span> — remove items with manager
          approval. Removing the last item voids the order.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="rounded-lg border border-plum-ink/15 px-2 py-2 text-sm"
          >
            <option value="">Reason…</option>
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
            placeholder="Manager PIN"
            className="rounded-lg border border-plum-ink/15 px-3 py-2 text-center text-sm tracking-[0.3em]"
          />
        </div>

        {error && <p className="mt-2 text-sm text-guava">{error}</p>}

        <ul className="mt-3 max-h-72 divide-y divide-plum-ink/5 overflow-y-auto">
          {items === "loading" ? (
            <li className="py-6 text-center text-sm text-plum-ink/50">Loading…</li>
          ) : items.length === 0 ? (
            <li className="py-6 text-center text-sm text-plum-ink/50">No items.</li>
          ) : (
            items.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-plum-ink">
                    {it.quantity}× {it.name}
                  </p>
                  <p className="text-xs text-plum-ink/45">{peso(it.lineTotal)}</p>
                </div>
                <button
                  onClick={() => removeItem(it.id)}
                  disabled={busy}
                  className="shrink-0 rounded-lg border border-guava/40 px-3 py-1.5 text-xs font-semibold text-guava disabled:opacity-50"
                >
                  {pendingId === it.id ? "Removing…" : "Void item"}
                </button>
              </li>
            ))
          )}
        </ul>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-full border border-plum-ink/15 py-2.5 text-sm font-semibold"
        >
          Done
        </button>
      </div>
    </div>
  );
}
