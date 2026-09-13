"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { addBranch, type AddBranchState } from "@/server/tenancy/branch-actions";

/**
 * Add a shop to this account.
 *
 * Created first and activated afterwards, so a failed checkout leaves a branch
 * the owner can retry rather than money taken for a restaurant that was never
 * made. It does NOT switch them into it: an unactivated branch can't be
 * entered, so doing so would land them somewhere else and look like a bug.
 */
export function AddBranchForm({ activationPrice }: { activationPrice: string }) {
  const [state, action, pending] = useActionState<AddBranchState, FormData>(addBranch, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state?.ok, router]);

  return (
    <form action={action} className="rounded-tile border border-plum-ink/10 bg-white p-5">
      <p className="font-heading font-bold">Add a branch</p>
      <p className="mt-1 text-sm text-plum-ink/60">
        A branch is a full restaurant of its own — its own menu, staff, orders and takings — that
        you run from this same login. {activationPrice} one-time to activate it, and paid features
        are bought per branch.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          name="name"
          required
          placeholder="Branch name — e.g. RR's Chicken · Navotas"
          className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
        />
        <button
          disabled={pending}
          className="rounded-full px-5 py-2.5 text-sm font-semibold btn-brand disabled:opacity-60"
        >
          {pending ? "Creating…" : "+ Add branch"}
        </button>
      </div>
      {state?.error && <p className="mt-2 text-sm text-guava">{state.error}</p>}
      {state?.ok && (
        <p className="mt-2 text-sm text-mango">
          Branch created. Activate it above to switch into it and start setting it up.
        </p>
      )}
    </form>
  );
}
