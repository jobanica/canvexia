"use client";

import { useActionState } from "react";
import { setCashierVoidPin, type VoidPinState } from "@/server/orders/void-pin";

export function VoidPinForm({ hasPin }: { hasPin: boolean }) {
  const [state, action, pending] = useActionState<VoidPinState, FormData>(setCashierVoidPin, null);

  return (
    <form action={action} className="space-y-3 rounded-tile border border-plum-ink/10 bg-white p-5">
      <div>
        <label className="block text-sm font-medium" htmlFor="pin">
          Void PIN
        </label>
        <p className="mt-0.5 text-xs text-plum-ink/55">
          A cashier must enter this PIN to void an unpaid order.{" "}
          {hasPin ? "A PIN is currently set." : "No PIN set yet — voiding is disabled until you add one."}
        </p>
        <input
          id="pin"
          name="pin"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={hasPin ? "Enter a new PIN to replace it" : "4–8 digits"}
          className="mt-2 w-48 rounded-lg border border-plum-ink/15 px-3 py-2 tracking-widest"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          disabled={pending}
          className="rounded-full px-4 py-2 text-sm font-semibold btn-brand disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save PIN"}
        </button>
        <span className="text-xs text-plum-ink/45">Leave blank and save to clear the PIN.</span>
      </div>
      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      {state?.ok && <p className="text-sm text-mango">{state.message}</p>}
    </form>
  );
}
