"use client";

import { useActionState, useMemo, useState } from "react";
import { recordSale, type SaleState } from "./actions";
import { peso } from "@/lib/money";
import { totalSale, type DiscountType } from "@/lib/pharmacy/discount";
import type { CatalogueRow } from "@/server/pharmacy/queries";

/**
 * The counter.
 *
 * The totals shown here are computed with the SAME function the server uses
 * (`totalSale`), not a re-implementation in the browser. A till that shows one
 * number and charges another is the worst possible bug in a pharmacy, and two
 * copies of the SC/PWD formula would be exactly how it happened. The server
 * still recomputes — this is a preview, never the source of truth.
 */
export function Counter({
  vatRatePct,
  products,
  canDispenseRx,
}: {
  vatRatePct: number;
  products: CatalogueRow[];
  /**
   * Whether THIS person may complete a cart containing a prescription-only
   * item. Passed in rather than derived here: the role lives in the session,
   * and the server checks it again before writing anything. This only decides
   * what the counter says before they try.
   */
  canDispenseRx: boolean;
}) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [discountType, setDiscountType] = useState<DiscountType>("none");
  const [state, formAction, pending] = useActionState<SaleState, FormData>(
    recordSale,
    { status: "idle" },
  );

  const lines = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, q]) => q > 0)
        .map(([productId, quantity]) => ({ productId, quantity })),
    [cart],
  );

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const totals = useMemo(
    () =>
      totalSale(
        lines.map((l) => ({
          unitPriceCentavos: byId.get(l.productId)?.priceCentavos ?? 0,
          quantity: l.quantity,
        })),
        { discountType, vatRatePct },
      ),
    [lines, byId, discountType, vatRatePct],
  );

  const needsRx = lines.some((l) => byId.get(l.productId)?.requiresPrescription);
  const blockedOnRx = needsRx && !canDispenseRx;
  const statutory = discountType === "sc" || discountType === "pwd";

  function add(id: string, delta: number) {
    setCart((c) => {
      const next = Math.max(0, (c[id] ?? 0) + delta);
      const onHand = byId.get(id)?.onHand ?? 0;
      return { ...c, [id]: Math.min(next, onHand) };
    });
  }

  return (
    <form action={formAction} className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      {/* No pharmacy id in this form. It comes from the session server-side. */}
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <input type="hidden" name="discountType" value={discountType} />

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Catalogue
        </h2>
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {products.map((p) => {
            const qty = cart[p.id] ?? 0;
            const out = p.onHand === 0;
            return (
              <li
                key={p.id}
                className={`flex items-center justify-between gap-4 px-4 py-3 ${
                  out ? "opacity-50" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {p.name}
                    {p.requiresPrescription && (
                      <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-xs text-violet-800">
                        Rx
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-slate-500">
                    {p.genericName ?? "—"} · {peso(p.priceCentavos)} ·{" "}
                    {out ? "out of stock" : `${p.onHand} ${p.unit}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => add(p.id, -1)}
                    disabled={qty === 0}
                    className="h-8 w-8 rounded border border-slate-300 disabled:opacity-30"
                    aria-label={`Remove one ${p.name}`}
                  >
                    −
                  </button>
                  <span className="w-8 text-center tabular-nums">{qty}</span>
                  <button
                    type="button"
                    onClick={() => add(p.id, 1)}
                    disabled={out || qty >= p.onHand}
                    className="h-8 w-8 rounded border border-slate-300 disabled:opacity-30"
                    aria-label={`Add one ${p.name}`}
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <aside className="h-fit rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Sale
        </h2>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-slate-600">Discount</span>
          <select
            value={discountType}
            onChange={(e) => setDiscountType(e.target.value as DiscountType)}
            className="w-full rounded border border-slate-300 px-2 py-1.5"
          >
            <option value="none">None</option>
            <option value="sc">Senior Citizen (20%, VAT-exempt)</option>
            <option value="pwd">PWD (20%, VAT-exempt)</option>
          </select>
        </label>

        {statutory && (
          <div className="mb-3 space-y-2 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <label className="block">
              <span className="mb-1 block text-emerald-900">ID number</span>
              <input
                name="beneficiaryIdNo"
                required
                className="w-full rounded border border-emerald-300 px-2 py-1.5"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-emerald-900">Name</span>
              <input
                name="beneficiaryName"
                className="w-full rounded border border-emerald-300 px-2 py-1.5"
              />
            </label>
            <p className="text-xs text-emerald-800">
              The discount is taken off the VAT-exclusive price and the sale is
              VAT-exempt. The ID goes on the receipt and in the logbook.
            </p>
          </div>
        )}

        {blockedOnRx && (
          <p className="mb-3 rounded border border-violet-300 bg-violet-50 p-3 text-sm text-violet-900">
            This cart contains a prescription-only item. A pharmacist has to
            complete it — under PH practice an Rx medicine is dispensed by, or
            directly supervised by, a registered pharmacist.
          </p>
        )}

        {needsRx && canDispenseRx && (
          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-violet-900">Prescription reference</span>
            <input
              name="prescriptionRef"
              required
              className="w-full rounded border border-violet-300 px-2 py-1.5"
            />
            <span className="mt-1 block text-xs text-violet-700">
              The cart contains a prescription-only item.
            </span>
          </label>
        )}

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-slate-600">Payment</span>
          <select
            name="paymentMethod"
            className="w-full rounded border border-slate-300 px-2 py-1.5"
          >
            <option value="cash">Cash</option>
            <option value="gcash">GCash</option>
            <option value="maya">Maya</option>
            <option value="card">Card</option>
          </select>
        </label>

        <dl className="mb-4 space-y-1 border-t border-slate-200 pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-600">Subtotal</dt>
            <dd className="tabular-nums">{peso(totals.subtotalCentavos)}</dd>
          </div>
          {totals.discountCentavos > 0 && (
            <div className="flex justify-between text-emerald-700">
              <dt>Discount</dt>
              <dd className="tabular-nums">−{peso(totals.discountCentavos)}</dd>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{peso(totals.totalCentavos)}</dd>
          </div>
          {totals.vatExemptCentavos > 0 && (
            <div className="flex justify-between text-xs text-slate-500">
              <dt>VAT-exempt sale</dt>
              <dd className="tabular-nums">{peso(totals.vatExemptCentavos)}</dd>
            </div>
          )}
        </dl>

        <button
          type="submit"
          disabled={pending || lines.length === 0 || blockedOnRx}
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {pending ? "Recording…" : "Complete sale"}
        </button>

        {state.status === "error" && (
          <p className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900">
            {state.message}
          </p>
        )}
        {state.status === "done" && (
          <div className="mt-3 space-y-2 rounded border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-900">
            <p>
              Receipt <span className="font-mono">{state.receiptNumber}</span> ·{" "}
              {peso(state.totalCentavos)}
              {state.changeCentavos > 0 && <> · change {peso(state.changeCentavos)}</>}
            </p>
            {/* A new tab, deliberately: the print dialog opens over the receipt
                and the counter stays as it is, ready for the next customer. */}
            <a
              href={`/receipts/${state.saleId}/print?auto=1`}
              target="_blank"
              rel="noopener"
              className="inline-block rounded bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white"
            >
              Print receipt
            </a>
          </div>
        )}

        <p className="mt-4 text-xs text-slate-500">
          Stock comes off the batch expiring soonest (FEFO), one sale line per
          batch — which batch a unit came from is the recall trail.
        </p>
      </aside>
    </form>
  );
}
