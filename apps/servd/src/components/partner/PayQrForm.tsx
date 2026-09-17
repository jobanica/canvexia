"use client";

import { useActionState } from "react";
import { savePayQrAction, type ReviewState } from "@/server/billing/renewal-actions";

/**
 * Where a merchant's money actually goes.
 *
 * Without this, "Renew" showed a restaurant an empty box and told them to
 * message somebody — `collectionMode: "partner_collects"` had been true in the
 * database for months while the product gave the partner no way to be paid.
 */
export function PayQrForm({ qrUrl, instructions }: { qrUrl: string | null; instructions: string }) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(savePayQrAction, null);

  return (
    <form action={action} className="rounded-tile border border-brand-ink/10 bg-white p-5">
      <p className="text-sm font-semibold">Your payment code</p>
      <p className="mt-0.5 text-xs text-brand-ink/50">
        Shown to a merchant the moment they tap Renew. GCash, Maya, or your bank&rsquo;s QR.
      </p>

      <div className="mt-3 flex flex-wrap items-start gap-4">
        {qrUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={qrUrl}
            alt="Your payment QR code"
            className="h-32 w-32 rounded-lg border border-brand-ink/10 object-contain"
          />
        ) : (
          <span className="flex h-32 w-32 items-center justify-center rounded-lg border border-dashed border-brand-ink/20 text-center text-xs text-brand-ink/40">
            No code yet
          </span>
        )}
        <div className="min-w-[240px] flex-1">
          <input
            type="file"
            name="qr"
            accept="image/png,image/jpeg,image/webp"
            className="block w-full text-sm"
          />
          <textarea
            name="payInstructions"
            defaultValue={instructions}
            rows={3}
            maxLength={500}
            placeholder="GCash 0917 123 4567 — Juan D. Reference: your shop name."
            className="mt-2 w-full rounded-lg border border-brand-ink/15 px-3 py-2 text-sm"
          />
          <button
            disabled={pending}
            className="mt-2 min-h-[44px] rounded-full border border-brand-ink/15 px-5 text-sm font-semibold text-brand-ink/70 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save payment details"}
          </button>
          {state?.ok && <p className="mt-2 text-sm text-brand-primary">{state.ok}</p>}
          {state?.error && <p className="mt-2 text-sm text-guava">{state.error}</p>}
        </div>
      </div>
    </form>
  );
}
