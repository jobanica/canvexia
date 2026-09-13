"use client";

import { useActionState, useEffect, useRef } from "react";
import { addCustomer, type AddCustomerState } from "@/server/customers/actions";

/**
 * Add-a-customer form. Used in the admin customer book and (compact) in the
 * cashier board. On success it clears the inputs and calls `onAdded` so the
 * parent can refresh.
 */
export function AddCustomerForm({
  compact = false,
  onAdded,
}: {
  compact?: boolean;
  onAdded?: () => void;
}) {
  const [state, action, pending] = useActionState<AddCustomerState, FormData>(addCustomer, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      onAdded?.();
    }
  }, [state, onAdded]);

  const input = "rounded-lg border border-plum-ink/15 px-3 py-2 text-sm";

  return (
    <form
      ref={formRef}
      action={action}
      className={compact ? "space-y-2" : "flex flex-wrap items-end gap-2 rounded-tile border border-plum-ink/10 bg-white p-4"}
    >
      <div className={compact ? "" : "flex-1 min-w-[160px]"}>
        {!compact && <label className="mb-1 block text-xs font-semibold text-plum-ink/50">Name</label>}
        <input name="name" placeholder="Name" className={`${input} ${compact ? "w-full" : "w-full"}`} />
      </div>
      <div className={compact ? "" : "flex-1 min-w-[160px]"}>
        {!compact && <label className="mb-1 block text-xs font-semibold text-plum-ink/50">Phone</label>}
        <input name="phone" required placeholder="Phone number" className={`${input} ${compact ? "w-full" : "w-full"}`} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className={`rounded-lg px-4 py-2 text-sm font-semibold btn-brand disabled:opacity-60 ${compact ? "w-full" : ""}`}
      >
        {pending ? "Adding…" : "Add customer"}
      </button>
      {state?.error && <p className="w-full text-xs text-guava">{state.error}</p>}
      {state?.ok && <p className="w-full text-xs text-mango">{state.message ?? "Added."}</p>}
    </form>
  );
}
