"use client";

import { useActionState } from "react";
import { addAdSpend, type SpendState } from "@/server/bizops/actions";

/**
 * Ad spend, typed in by hand.
 *
 * Deliberately manual: this layer holds no third-party credential, and a
 * founder spending across Facebook and anywhere else would be reconciling it by
 * hand regardless. Amounts are in pesos, because that is what the receipt says.
 */
export function AdSpendForm() {
  const [state, action, pending] = useActionState<SpendState, FormData>(addAdSpend, null);
  const today = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
  const field = "rounded-lg border border-plum-ink/15 px-3 py-2 text-sm";

  return (
    <form action={action} className="rounded-tile border border-plum-ink/10 bg-white p-4">
      <p className="font-heading font-bold">Add ad spend</p>
      <p className="mb-3 text-xs text-plum-ink/50">
        Cost per lead and CAC stay blank until there is a number to divide by.
      </p>
      <div className="flex flex-wrap gap-2">
        <input type="date" name="spendDate" defaultValue={today} className={field} required />
        <input
          name="amountPesos"
          type="number"
          min="1"
          step="0.01"
          placeholder="Amount ₱"
          className={`${field} w-32`}
          required
        />
        <input name="platform" defaultValue="facebook" className={`${field} w-32`} />
        <input name="campaign" placeholder="Campaign (optional)" className={`${field} flex-1`} />
        <button
          disabled={pending}
          className="rounded-full px-5 py-2 text-sm font-semibold btn-brand disabled:opacity-60"
        >
          {pending ? "Saving…" : "Add"}
        </button>
      </div>
      {state?.error && <p className="mt-2 text-sm text-guava">{state.error}</p>}
      {state?.ok && <p className="mt-2 text-sm text-mango">Saved.</p>}
    </form>
  );
}
