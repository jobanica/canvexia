"use client";

import { useActionState } from "react";
import { activateBranch, type ActivateBranchState } from "@/server/tenancy/branch-actions";

/**
 * Pay the ₱499 that switches a branch on.
 *
 * The action redirects straight to the Xendit invoice, so a success state never
 * renders here — anything that comes back is an error worth showing.
 */
export function ActivateBranchButton({
  restaurantId,
  price,
}: {
  restaurantId: string;
  price: string;
}) {
  const [state, action, pending] = useActionState<ActivateBranchState, FormData>(
    activateBranch,
    null,
  );

  return (
    <form action={action} className="shrink-0 text-right">
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <button
        disabled={pending}
        className="rounded-full px-4 py-2 text-sm font-semibold btn-brand disabled:opacity-60"
      >
        {pending ? "Opening checkout…" : `Activate — ${price}`}
      </button>
      {state?.error && <p className="mt-1 max-w-xs text-xs text-guava">{state.error}</p>}
    </form>
  );
}
