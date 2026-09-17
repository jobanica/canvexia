"use client";

import { useActionState, useMemo, useState } from "react";
import { receiveAction, type ReceivingState } from "./actions";
import { checkDelivery, issuesFor, hasErrors, type DeliveryLine } from "@/lib/pharmacy/receiving";
import { peso } from "@/lib/money";

/**
 * Recording a delivery.
 *
 * The same `checkDelivery` the server runs, run here too — so a short-dated
 * batch or a missing lot number is flagged while the box is still in someone's
 * hands, not after it is on the shelf. The server re-checks; this is the
 * preview, never the decision.
 *
 * `deliveryRef` is minted ONCE per form, not per submit. It is the idempotency
 * key: a slow connection and a second click would otherwise double the stock,
 * and both copies would look perfectly consistent.
 */

const IDLE: ReceivingState = { status: "idle" };

interface ProductOption {
  id: string;
  name: string;
  genericName: string | null;
  unit: string;
}

type Draft = {
  key: number;
  productId: string;
  newProductName: string;
  newProductPrice: string;
  lotNumber: string;
  expiryDate: string;
  noExpiry: boolean;
  quantity: string;
  unitCost: string;
};

function blank(key: number): Draft {
  return {
    key,
    productId: "",
    newProductName: "",
    newProductPrice: "",
    lotNumber: "",
    expiryDate: "",
    noExpiry: false,
    quantity: "",
    unitCost: "",
  };
}

/** Pesos as typed → centavos. "12.50" → 1250. Empty → 0. */
function toCentavos(v: string): number {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function ReceivingForm({
  products,
  suppliers,
  canCreateProducts,
}: {
  products: ProductOption[];
  suppliers: { id: string; name: string }[];
  canCreateProducts: boolean;
}) {
  const [state, action, pending] = useActionState(receiveAction, IDLE);
  const [rows, setRows] = useState<Draft[]>([blank(0)]);
  const [nextKey, setNextKey] = useState(1);
  const [supplierId, setSupplierId] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [reference, setReference] = useState("");

  // Minted once for the lifetime of this form. A new one only after a
  // successful save, when the form resets.
  const [deliveryRef, setDeliveryRef] = useState(() => crypto.randomUUID());

  const lines: DeliveryLine[] = useMemo(
    () =>
      rows.map((r) => ({
        productId: r.productId || null,
        newProductName: r.newProductName || undefined,
        newProductPriceCentavos: r.newProductPrice ? toCentavos(r.newProductPrice) : undefined,
        lotNumber: r.lotNumber || null,
        expiryDate: r.noExpiry ? null : r.expiryDate || "",
        quantity: r.quantity ? Number.parseInt(r.quantity, 10) : 0,
        unitCostCentavos: r.unitCost ? toCentavos(r.unitCost) : 0,
      })),
    [rows],
  );

  // Only check rows someone has started, so an empty new row is not an error.
  const started = lines.map((l, i) => ({ l, i })).filter(({ l }) => isStarted(l));
  const issues = useMemo(
    () =>
      checkDelivery(started.map((s) => s.l)).map((issue) => ({
        ...issue,
        index: started[issue.index]?.i ?? issue.index,
      })),
    [started],
  );
  const blocked = hasErrors(issues) || started.length === 0;

  const totalCost = lines.reduce((sum, l) => sum + l.quantity * l.unitCostCentavos, 0);
  const totalUnits = lines.reduce((sum, l) => sum + l.quantity, 0);

  // After a successful save the form empties and takes a fresh key, so the
  // next delivery is genuinely a new one.
  const justSaved = state.status === "done";
  if (justSaved && rows.length === 1 && rows[0].quantity === "" && rows[0].productId === "") {
    // already reset
  }

  function reset() {
    setRows([blank(nextKey)]);
    setNextKey((k) => k + 1);
    setSupplierId("");
    setNewSupplierName("");
    setReference("");
    setDeliveryRef(crypto.randomUUID());
  }

  function update(key: number, patch: Partial<Draft>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="deliveryRef" value={deliveryRef} />
      <input type="hidden" name="supplierId" value={supplierId} />
      <input type="hidden" name="newSupplierName" value={supplierId ? "" : newSupplierName} />
      <input type="hidden" name="reference" value={reference} />
      <input
        type="hidden"
        name="lines"
        value={JSON.stringify(started.map((s) => s.l))}
      />

      <section className="grid gap-4 rounded-lg border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-300">Supplier</span>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-full rounded border border-white/15 px-2 py-1.5"
          >
            <option value="">— new or unrecorded —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {!supplierId && (
            <input
              value={newSupplierName}
              onChange={(e) => setNewSupplierName(e.target.value)}
              placeholder="New supplier name (optional)"
              className="mt-2 w-full rounded border border-white/15 px-2 py-1.5"
            />
          )}
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-300">Delivery reference</span>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Invoice or DR number"
            className="w-full rounded border border-white/15 px-2 py-1.5"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Written onto every movement in this delivery.
          </span>
        </label>
      </section>

      <section className="space-y-4">
        {rows.map((row, index) => {
          const rowIssues = issuesFor(issues, index);
          const errors = rowIssues.filter((i) => i.severity === "error");
          const warnings = rowIssues.filter((i) => i.severity === "warning");
          const creating = !row.productId;

          return (
            <div
              key={row.key}
              className={`rounded-lg border bg-white/[0.04] p-4 ${
                errors.length ? "border-red-300" : "border-white/10"
              }`}
            >
              <div className="grid gap-3 sm:grid-cols-6">
                <label className="block text-sm sm:col-span-3">
                  <span className="mb-1 block text-slate-300">Product</span>
                  <select
                    value={row.productId}
                    onChange={(e) => update(row.key, { productId: e.target.value })}
                    className="w-full rounded border border-white/15 px-2 py-1.5"
                  >
                    <option value="">
                      {canCreateProducts ? "— new product —" : "— pick one —"}
                    </option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.genericName ? ` (${p.genericName})` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm sm:col-span-2">
                  <span className="mb-1 block text-slate-300">Lot number</span>
                  <input
                    value={row.lotNumber}
                    onChange={(e) => update(row.key, { lotNumber: e.target.value })}
                    className="w-full rounded border border-white/15 px-2 py-1.5 font-mono"
                  />
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block text-slate-300">Quantity</span>
                  <input
                    type="number"
                    min={1}
                    value={row.quantity}
                    onChange={(e) => update(row.key, { quantity: e.target.value })}
                    className="w-full rounded border border-white/15 px-2 py-1.5 tabular-nums"
                  />
                </label>

                {creating && (
                  <>
                    <label className="block text-sm sm:col-span-3">
                      <span className="mb-1 block text-slate-300">New product name</span>
                      <input
                        value={row.newProductName}
                        onChange={(e) => update(row.key, { newProductName: e.target.value })}
                        disabled={!canCreateProducts}
                        placeholder="e.g. Biogesic 500mg"
                        className="w-full rounded border border-white/15 px-2 py-1.5 disabled:bg-white/10"
                      />
                    </label>
                    <label className="block text-sm sm:col-span-3">
                      <span className="mb-1 block text-slate-300">Selling price (₱)</span>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={row.newProductPrice}
                        onChange={(e) => update(row.key, { newProductPrice: e.target.value })}
                        disabled={!canCreateProducts}
                        className="w-full rounded border border-white/15 px-2 py-1.5 tabular-nums disabled:bg-white/10"
                      />
                    </label>
                  </>
                )}

                <label className="block text-sm sm:col-span-2">
                  <span className="mb-1 block text-slate-300">Expiry</span>
                  <input
                    type="date"
                    value={row.expiryDate}
                    disabled={row.noExpiry}
                    onChange={(e) => update(row.key, { expiryDate: e.target.value })}
                    className="w-full rounded border border-white/15 px-2 py-1.5 disabled:bg-white/10"
                  />
                  <label className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      checked={row.noExpiry}
                      onChange={(e) => update(row.key, { noExpiry: e.target.checked })}
                    />
                    None printed
                  </label>
                </label>

                <label className="block text-sm sm:col-span-2">
                  <span className="mb-1 block text-slate-300">Unit cost (₱)</span>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={row.unitCost}
                    onChange={(e) => update(row.key, { unitCost: e.target.value })}
                    className="w-full rounded border border-white/15 px-2 py-1.5 tabular-nums"
                  />
                </label>

                <div className="flex items-end justify-end sm:col-span-2">
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
                      className="text-xs text-slate-500 hover:text-red-300 hover:underline"
                    >
                      Remove line
                    </button>
                  )}
                </div>
              </div>

              {errors.map((i, n) => (
                <p key={`e${n}`} role="alert" className="mt-2 text-sm text-red-300">
                  {i.message}
                </p>
              ))}
              {warnings.map((i, n) => (
                <p key={`w${n}`} className="mt-2 text-sm text-amber-300">
                  {i.message}
                </p>
              ))}
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => {
            setRows((rs) => [...rs, blank(nextKey)]);
            setNextKey((k) => k + 1);
          }}
          className="rounded-md border border-white/15 bg-white/[0.04] px-3 py-1.5 text-sm hover:bg-white/[0.06]"
        >
          Add another line
        </button>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4">
        <dl className="flex gap-6 text-sm">
          <div>
            <dt className="text-slate-500">Units</dt>
            <dd className="tabular-nums">{totalUnits}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Total cost</dt>
            <dd className="tabular-nums">{peso(totalCost)}</dd>
          </div>
        </dl>

        <div className="flex items-center gap-3">
          {state.status === "done" && (
            <button
              type="button"
              onClick={reset}
              className="rounded-md border border-white/15 px-3 py-2 text-sm hover:bg-white/[0.06]"
            >
              Start another
            </button>
          )}
          <button
            type="submit"
            disabled={pending || blocked}
            className="rounded-md brand-gradient px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {pending ? "Recording…" : "Receive delivery"}
          </button>
        </div>
      </section>

      {state.status === "error" && (
        <p role="alert" className="rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {state.message}
        </p>
      )}
      {state.status === "done" && (
        <p className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          {state.message}
        </p>
      )}
    </form>
  );
}

/** A row nobody has touched is not an incomplete row. */
function isStarted(l: DeliveryLine): boolean {
  return Boolean(
    l.productId ||
      l.newProductName?.trim() ||
      l.quantity > 0 ||
      l.lotNumber?.trim() ||
      (l.expiryDate && l.expiryDate.length > 0),
  );
}
