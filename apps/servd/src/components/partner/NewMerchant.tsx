"use client";

import { useActionState, useState } from "react";
import {
  provisionMerchantAction,
  type ProvisionState,
} from "@/server/partners/provision-actions";

const IDLE: ProvisionState = { status: "idle" };

export interface ProductChoice {
  id: string;
  name: string;
  description: string;
}

/**
 * Opening a merchant account, from the portal.
 *
 * The product list is passed in from the registry rather than written here, so
 * a vertical appears in this form by registering an adapter (D36). Nothing in
 * this component knows what any of them are.
 */
export function NewMerchant({ products }: { products: ProductChoice[] }) {
  const [state, action, pending] = useActionState(provisionMerchantAction, IDLE);
  const [productId, setProductId] = useState(products[0]?.id ?? "");

  if (products.length === 0) return null;
  const chosen = products.find((p) => p.id === productId);

  return (
    <div className="mt-4 rounded-tile border border-brand-ink/10 bg-white p-5">
      <p className="mb-1 text-sm font-semibold">Open a merchant account</p>
      <p className="mb-3 text-xs text-brand-ink/50">
        The account is created inactive. The merchant signs in, records whatever
        their product requires, and you switch it on — nothing dispenses or
        trades before you do.
      </p>

      {state.status === "error" && (
        <p role="alert" className="mb-3 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-900">
          {state.message}
        </p>
      )}
      {state.status === "done" && (
        <p className="mb-3 rounded border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-900">
          {state.message}
        </p>
      )}

      <form action={action} className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-brand-ink/70">Product</span>
          <select
            name="productId"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="w-full rounded-lg border border-brand-ink/15 px-2 py-1.5 text-sm"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {chosen && (
            <span className="mt-1 block text-xs text-brand-ink/45">{chosen.description}</span>
          )}
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-brand-ink/70">Business name</span>
          <input
            name="name"
            required
            maxLength={120}
            placeholder="Botica San Roque"
            className="w-full rounded-lg border border-brand-ink/15 px-2 py-1.5 text-sm"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-brand-ink/70">Address</span>
            <input
              name="address"
              maxLength={300}
              className="w-full rounded-lg border border-brand-ink/15 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-brand-ink/70">Phone</span>
            <input
              name="phone"
              maxLength={40}
              className="w-full rounded-lg border border-brand-ink/15 px-2 py-1.5 text-sm"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          {pending ? "Setting up…" : "Open account"}
        </button>
      </form>
    </div>
  );
}
