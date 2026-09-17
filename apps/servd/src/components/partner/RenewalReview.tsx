"use client";

import { useActionState, useState } from "react";
import {
  confirmRenewalAction,
  rejectRenewalAction,
  type ReviewState,
} from "@/server/billing/renewal-actions";

/**
 * One renewal, waiting on a person.
 *
 * THE AMOUNT IS EDITABLE and pre-filled with the list price, because the 30%
 * CANVEXIA takes is a share of what was ACTUALLY collected. A partner may
 * charge above the floor; recording the floor instead would understate what
 * they owe and quietly make the ledger fiction.
 *
 * Confirming is the only thing on this screen that moves money, so it is the
 * only thing that asks for a number. Turning one down asks for a sentence,
 * which the merchant reads.
 */
export function RenewalReview({
  renewalId,
  merchantName,
  amountPesos,
  receiptUrl,
  requestedAt,
  hasReceipt,
}: {
  renewalId: string;
  merchantName: string;
  amountPesos: number;
  receiptUrl: string | null;
  requestedAt: string;
  hasReceipt: boolean;
}) {
  const [cState, confirm, confirming] = useActionState<ReviewState, FormData>(
    confirmRenewalAction,
    null,
  );
  const [rState, reject, rejecting] = useActionState<ReviewState, FormData>(
    rejectRenewalAction,
    null,
  );
  const [turningDown, setTurningDown] = useState(false);

  const done = cState?.ok ?? rState?.ok;
  if (done) {
    return (
      <li className="rounded-tile border border-brand-ink/10 bg-white p-4 text-sm text-brand-ink/70">
        <span className="font-semibold text-brand-ink">{merchantName}</span> — {done}
      </li>
    );
  }

  return (
    <li className="rounded-tile border border-brand-ink/10 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">{merchantName}</p>
        <p className="text-xs text-brand-ink/45">Asked {requestedAt}</p>
      </div>

      {receiptUrl ? (
        <a href={receiptUrl} target="_blank" rel="noreferrer" className="mt-3 block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={receiptUrl}
            alt={`Receipt from ${merchantName}`}
            className="h-48 w-full rounded-lg border border-brand-ink/10 object-contain"
          />
          <span className="mt-1 block text-xs font-semibold text-brand-primary underline">
            Open full size
          </span>
        </a>
      ) : (
        <p className="mt-3 rounded-lg bg-brand-surface px-3 py-2 text-xs text-brand-ink/60">
          {hasReceipt
            ? "The receipt could not be loaded. Try again in a moment."
            : "They have not uploaded a receipt yet. Confirm anyway only if you know the money arrived."}
        </p>
      )}

      {!turningDown ? (
        <form action={confirm} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="renewalId" value={renewalId} />
          <label className="text-xs font-semibold text-brand-ink/60">
            What you collected
            <span className="mt-1 flex items-center gap-1">
              <span className="text-sm text-brand-ink/45">₱</span>
              <input
                name="amountPesos"
                type="number"
                min="0"
                step="1"
                defaultValue={amountPesos}
                required
                className="min-h-[44px] w-32 rounded-lg border border-brand-ink/15 px-3 text-sm"
              />
            </span>
          </label>
          <button
            disabled={confirming}
            className="min-h-[44px] rounded-full px-5 text-sm font-semibold btn-brand text-white disabled:opacity-50"
          >
            {confirming ? "Confirming…" : "Confirm payment"}
          </button>
          <button
            type="button"
            onClick={() => setTurningDown(true)}
            className="min-h-[44px] rounded-full border border-brand-ink/15 px-4 text-sm font-semibold text-brand-ink/60"
          >
            Turn down
          </button>
          {cState?.error && <p className="w-full text-sm text-guava">{cState.error}</p>}
        </form>
      ) : (
        <form action={reject} className="mt-3">
          <input type="hidden" name="renewalId" value={renewalId} />
          <input
            name="note"
            required
            maxLength={300}
            placeholder="Why — e.g. receipt is for a different amount"
            className="min-h-[44px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          />
          <div className="mt-2 flex gap-2">
            <button
              disabled={rejecting}
              className="min-h-[44px] rounded-full bg-guava px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {rejecting ? "Sending…" : "Turn down"}
            </button>
            <button
              type="button"
              onClick={() => setTurningDown(false)}
              className="min-h-[44px] rounded-full border border-brand-ink/15 px-4 text-sm font-semibold text-brand-ink/60"
            >
              Cancel
            </button>
          </div>
          {rState?.error && <p className="mt-2 text-sm text-guava">{rState.error}</p>}
        </form>
      )}
    </li>
  );
}
