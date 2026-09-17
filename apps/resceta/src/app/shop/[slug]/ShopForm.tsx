"use client";

import { useActionState } from "react";
import { submitOrder, type ShopState } from "./actions";
import type { ShopItem } from "@/server/pharmacy/storefront";
import { peso } from "@/lib/money";

const IDLE: ShopState = { status: "idle" };
const FIELD = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

/**
 * The customer's side.
 *
 * ONE FORM, NO CART. A cart needs storage, a session and a second screen; this
 * is a list with a quantity box beside each item, and the order is what has a
 * number in it. For a shop with a few hundred lines that is simpler for
 * everybody and works with JavaScript off.
 */
export function ShopForm({
  slug,
  items,
  acceptsDelivery,
}: {
  slug: string;
  items: ShopItem[];
  acceptsDelivery: boolean;
}) {
  const [state, action, pending] = useActionState(submitOrder, IDLE);

  // Shown FIRST, before anything that could unmount it: the order number is
  // the only thing the customer can quote on the phone, and a re-render that
  // replaced it with an empty form would lose it.
  if (state.status === "done") {
    return (
      <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-6">
        <p className="text-lg font-semibold text-emerald-900">
          Order {state.orderNumber} sent
        </p>
        <p className="mt-1 text-sm text-emerald-900">
          The pharmacy will ring you to confirm what is available and what it
          comes to. Nothing is charged here — you pay when you collect.
        </p>
      </div>
    );
  }

  const available = items.filter((i) => i.inStock);
  const out = items.filter((i) => !i.inStock);

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="slug" value={slug} />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          What we have
        </h2>
        {available.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            Nothing is in stock right now.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {available.map((i) => (
                  <tr key={i.id}>
                    <td className="px-4 py-2">
                      <input type="hidden" name="productId" value={i.id} />
                      <span className="font-medium">{i.name}</span>
                      <p className="text-xs text-slate-500">
                        {[i.genericName, i.strength, i.form].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{peso(i.priceCentavos)}</td>
                    <td className="px-4 py-2 text-right">
                      <input
                        name="quantity"
                        type="number"
                        min={0}
                        step={1}
                        placeholder="0"
                        aria-label={`How many ${i.name}`}
                        className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {out.length > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            Out of stock today: {out.map((i) => i.name).join(", ")}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold">How to reach you</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Your name
            <input name="customerName" required maxLength={200} className={FIELD} />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Mobile
            <input name="customerPhone" required maxLength={40} className={FIELD} />
          </label>
        </div>

        {acceptsDelivery ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Collect or deliver
              <select name="fulfilment" defaultValue="pickup" className={FIELD}>
                <option value="pickup">I will collect it</option>
                <option value="delivery">Please deliver</option>
              </select>
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Delivery address
              <input name="customerAddress" maxLength={400} className={FIELD} />
            </label>
          </div>
        ) : (
          <input type="hidden" name="fulfilment" value="pickup" />
        )}

        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Anything else
          <textarea name="notes" rows={2} maxLength={600} className={FIELD} />
        </label>

        <button
          disabled={pending}
          className="mt-4 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {pending ? "Sending…" : "Send the order"}
        </button>
        {state.status === "error" && <p className="mt-2 text-sm text-red-700">{state.message}</p>}
      </section>
    </form>
  );
}
