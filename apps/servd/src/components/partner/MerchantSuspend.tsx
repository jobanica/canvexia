"use client";

import { useActionState, useState } from "react";
import {
  suspendMerchantAction,
  reactivateMerchantAction,
  type MerchantActionState,
} from "@/server/partners/merchant-actions";

/**
 * Switch a merchant off, or back on.
 *
 * TWO DELIBERATE FRICTIONS on the way off, and none on the way back.
 *
 * Suspending stops a real shop trading: staff lose the app, the storefront
 * stops taking orders. So it is behind a confirm, and it asks WHY — a
 * suspension nobody can explain is one that gets reversed by the next person to
 * hear the owner complain. Reactivating is one tap, because the cost of a
 * wrongly-suspended shop is measured in lost lunch service.
 */
export function MerchantSuspend({
  merchantId,
  productId,
  suspended,
}: {
  merchantId: string;
  productId: string;
  suspended: boolean;
}) {
  const [state, action, pending] = useActionState<MerchantActionState, FormData>(
    suspended ? reactivateMerchantAction : suspendMerchantAction,
    null,
  );
  const [confirming, setConfirming] = useState(false);

  const hidden = (
    <>
      <input type="hidden" name="merchantId" value={merchantId} />
      <input type="hidden" name="productId" value={productId} />
    </>
  );

  if (state?.ok) {
    return (
      <p className="mt-3 rounded-lg bg-brand-surface px-3 py-2 text-sm text-brand-ink/70">
        {state.ok} <span className="text-brand-ink/45">Refresh to see the new state.</span>
      </p>
    );
  }

  if (suspended) {
    return (
      <form action={action} className="mt-3">
        {hidden}
        <button
          disabled={pending}
          className="min-h-[44px] rounded-full px-5 text-sm font-semibold btn-brand text-white disabled:opacity-50"
        >
          {pending ? "Switching back on…" : "Reactivate this account"}
        </button>
        {state?.error && <p className="mt-2 text-sm text-guava">{state.error}</p>}
      </form>
    );
  }

  if (!confirming) {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="min-h-[44px] rounded-full border border-guava/40 px-5 text-sm font-semibold text-guava hover:bg-guava/10"
        >
          Suspend this account
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="mt-3 rounded-lg border border-guava/40 bg-guava/5 p-4">
      {hidden}
      <p className="text-sm font-semibold text-brand-ink">Suspend this account?</p>
      <p className="mt-1 text-xs leading-relaxed text-brand-ink/60">
        Their staff lose the app and the ordering page stops taking orders, immediately.
        Nothing is deleted — the menu, the orders and the QR codes all wait. You can switch
        it back on at any time.
      </p>
      <input
        name="reason"
        required
        maxLength={300}
        placeholder="Why — e.g. September not paid"
        className="mt-3 min-h-[44px] w-full rounded-lg border border-brand-ink/15 bg-white px-3 text-sm"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          disabled={pending}
          className="min-h-[44px] rounded-full bg-guava px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Suspending…" : "Yes, suspend"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="min-h-[44px] rounded-full border border-brand-ink/15 px-5 text-sm font-semibold text-brand-ink/70"
        >
          Cancel
        </button>
      </div>
      {state?.error && <p className="mt-2 text-sm text-guava">{state.error}</p>}
    </form>
  );
}
