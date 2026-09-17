"use client";

import { useActionState, useState } from "react";
import { raisePurchaseOrder, type PoState } from "../actions";

const IDLE: PoState = { status: "idle" };
const FIELD = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm";

export interface PoProduct {
  id: string;
  name: string;
  genericName: string | null;
  unit: string;
  /** What the last delivery of this cost, as the starting price. */
  lastCostCentavos: number;
  onHand: number;
  reorderPoint: number;
}

/**
 * Raising an order.
 *
 * THE COST DEFAULTS TO WHAT THE LAST DELIVERY COST. Typing a price for every
 * line of a forty-line order is how a pharmacy stops raising orders; the last
 * cost is nearly always right and is always visible to correct.
 *
 * Lines are added and removed in the browser and submitted as parallel arrays.
 * A server round-trip per line is unusable on a connection that drops.
 */
export function NewPoForm({
  products,
  suppliers,
}: {
  products: PoProduct[];
  suppliers: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(raisePurchaseOrder, IDLE);
  // Start with the items that are actually low: the reason somebody opened
  // this screen is almost always the Alerts page.
  const [rows, setRows] = useState<number[]>([0]);

  const low = products.filter((p) => p.onHand <= p.reorderPoint);

  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Supplier
          <select name="supplierId" className={`mt-1 ${FIELD}`} defaultValue="">
            <option value="">Not decided yet</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Expected
          <input type="date" name="expectedDate" className={`mt-1 ${FIELD}`} />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Notes
          <input name="notes" maxLength={2000} className={`mt-1 ${FIELD}`} />
        </label>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">Lines</p>
          {low.length > 0 && (
            <button
              type="button"
              onClick={() => setRows(low.map((_, i) => i))}
              className="text-xs text-slate-500 underline"
            >
              Fill with the {low.length} item{low.length === 1 ? "" : "s"} below reorder
            </button>
          )}
        </div>

        <div className="space-y-3">
          {rows.map((rowKey, i) => {
            const suggested = low[i];
            return (
              <div key={rowKey} className="grid gap-2 sm:grid-cols-[1fr_7rem_8rem_2rem]">
                <select
                  name="productId"
                  defaultValue={suggested?.id ?? ""}
                  className={FIELD}
                  required
                >
                  <option value="">Pick a product…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.genericName ? ` · ${p.genericName}` : ""} — {p.onHand} {p.unit} on hand
                    </option>
                  ))}
                </select>
                <input
                  name="quantity"
                  type="number"
                  min={1}
                  step={1}
                  placeholder="Qty"
                  className={FIELD}
                />
                <input
                  name="unitCost"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Unit cost ₱"
                  defaultValue={
                    suggested && suggested.lastCostCentavos > 0
                      ? (suggested.lastCostCentavos / 100).toFixed(2)
                      : ""
                  }
                  className={FIELD}
                />
                <button
                  type="button"
                  onClick={() => setRows((r) => r.filter((k) => k !== rowKey))}
                  className="text-slate-400 hover:text-red-700"
                  aria-label="Remove line"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setRows((r) => [...r, (r[r.length - 1] ?? 0) + 1])}
          className="mt-3 text-sm text-slate-600 underline"
        >
          Add another line
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button
          disabled={pending || rows.length === 0}
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {pending ? "Raising…" : "Raise the order"}
        </button>
        {state.status === "error" && <span className="text-sm text-red-700">{state.message}</span>}
      </div>
    </form>
  );
}
