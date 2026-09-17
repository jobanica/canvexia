"use client";

import { useActionState } from "react";
import { startRenewal, uploadReceipt, type BillingState } from "./actions";

const idle: BillingState = { status: "idle" };

/**
 * PAYING A PERSON, not a card form.
 *
 * Resceta is sold by partners who collect in cash or on an e-wallet, off this
 * system — the subscription carries `billedExternally`, so nothing here ever
 * charges anybody and the daily cron never duns this account. What the pharmacy
 * can do is pay their partner and say so; what the partner does is recognise
 * the payment. That human step IS the settlement, and pretending otherwise
 * would let anyone extend their own subscription by uploading a picture of a
 * sunset.
 *
 * Three states, because they are three different things to do: nothing in
 * flight, paid-and-waiting, and turned down with a reason.
 */
export function RenewPanel({
  status,
  partnerName,
  qrUrl,
  instructions,
  rejectedNote,
}: {
  status: "none" | "requested" | "receipt_uploaded";
  partnerName: string;
  qrUrl: string | null;
  instructions: string | null;
  rejectedNote: string | null;
}) {
  const [startState, startAction, starting] = useActionState<BillingState, FormData>(
    async () => startRenewal(),
    idle,
  );
  const [upState, upAction, uploading] = useActionState(uploadReceipt, idle);

  if (status === "receipt_uploaded") {
    return (
      <section className="rounded-lg border border-green-300 bg-green-50 p-5">
        <h2 className="font-semibold text-green-900">Waiting on {partnerName}</h2>
        <p className="mt-1 text-sm text-green-900">
          Your receipt is with them. Once they recognise the payment your plan is extended — you
          do not need to do anything else.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.04] backdrop-blur-xl p-5">
      <h2 className="font-semibold">Renew with {partnerName}</h2>

      {rejectedNote && (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <strong>Your last payment was turned down.</strong> {rejectedNote}
        </p>
      )}

      {status === "none" ? (
        <>
          <p className="mt-1 text-sm text-slate-300">
            {partnerName} collects for this account. Start a renewal to see their payment code.
          </p>
          <form action={startAction} className="mt-3">
            <button
              disabled={starting}
              className="rounded-lg brand-gradient px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {starting ? "Starting…" : "Renew"}
            </button>
          </form>
          {startState.status === "error" && (
            <p className="mt-2 text-sm text-red-300">{startState.message}</p>
          )}
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-300">
            Pay {partnerName} using the code below, then upload the receipt.
          </p>

          {qrUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={qrUrl}
              alt={`${partnerName}'s payment code`}
              className="mt-3 h-56 w-56 rounded-lg border border-white/10 bg-white/[0.04] backdrop-blur-xl object-contain p-2"
            />
          ) : (
            // Said plainly rather than left as an empty box. The partner has not
            // uploaded one, and telling the pharmacy to scan nothing is worse
            // than telling them to ring.
            <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.06] p-3 text-sm text-slate-300">
              {partnerName} has not uploaded a payment code yet. Contact them for how to pay.
            </p>
          )}

          {instructions && (
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-200">{instructions}</p>
          )}

          <form action={upAction} className="mt-4 space-y-2">
            <label className="block text-xs font-medium text-slate-300">
              Your receipt
              <input
                type="file"
                name="receipt"
                accept="image/jpeg,image/png,image/webp"
                required
                className="mt-1 block w-full text-sm"
              />
            </label>
            <button
              disabled={uploading}
              className="rounded-lg brand-gradient px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {uploading ? "Sending…" : "Send receipt"}
            </button>
          </form>
          {upState.status === "error" && (
            <p className="mt-2 text-sm text-red-300">{upState.message}</p>
          )}
          {upState.status === "done" && (
            <p className="mt-2 text-sm text-green-700">{upState.message}</p>
          )}
        </>
      )}
    </section>
  );
}
