"use client";

import { useActionState } from "react";
import {
  startRenewalAction,
  uploadReceiptAction,
  type RenewState,
} from "@/server/billing/renewal-actions";

/**
 * Renewing, from the restaurant's side.
 *
 * THREE STEPS, ONE SCREEN, because the person doing this is a shop owner with
 * their phone in one hand: tap Renew, scan or download the partner's code and
 * pay, upload the receipt. Then they wait for a human to recognise the payment.
 *
 * It says "your partner" rather than "Servd" throughout, because that is who
 * takes the money — `collectionMode: "partner_collects"` — and telling an owner
 * they have paid Servd when they have paid their operator is how a support
 * conversation starts in the wrong place.
 */
export function RenewPanel({
  status,
  qrUrl,
  instructions,
  partnerName,
  rejectedNote,
}: {
  status: "none" | "requested" | "receipt_uploaded";
  qrUrl: string | null;
  instructions: string | null;
  partnerName: string;
  /** Why the last attempt was turned down, if it was. */
  rejectedNote: string | null;
}) {
  const [startState, start, starting] = useActionState<RenewState, FormData>(
    startRenewalAction,
    null,
  );
  const [upState, upload, uploading] = useActionState<RenewState, FormData>(
    uploadReceiptAction,
    null,
  );

  const started = status !== "none" || startState?.requested;
  const waiting = status === "receipt_uploaded" || !!upState?.ok;

  if (waiting) {
    return (
      <div className="rounded-tile border border-mango/40 bg-mango/10 p-5">
        <p className="font-heading font-bold text-plum-ink">Receipt sent ✓</p>
        <p className="mt-1 text-sm text-plum-ink/70">
          {partnerName} will check it and extend your plan. You do not need to pay again.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
      <p className="font-heading font-bold text-plum-ink">Renew your plan</p>

      {rejectedNote && !started && (
        <p className="mt-2 rounded-lg bg-guava/10 px-3 py-2 text-sm text-guava">
          Your last receipt was turned down: {rejectedNote}
        </p>
      )}

      {!started ? (
        <form action={start} className="mt-3">
          <p className="mb-3 text-sm text-plum-ink/60">
            You pay {partnerName} directly. Tap below and they will show you how.
          </p>
          <button
            disabled={starting}
            className="min-h-[44px] rounded-full px-5 text-sm font-semibold btn-brand text-white disabled:opacity-50"
          >
            {starting ? "One moment…" : "Renew"}
          </button>
          {startState?.error && <p className="mt-2 text-sm text-guava">{startState.error}</p>}
        </form>
      ) : (
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-semibold text-plum-ink">1. Pay {partnerName}</p>
            {qrUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrUrl}
                  alt={`${partnerName} payment QR code`}
                  className="mt-2 h-56 w-56 rounded-lg border border-plum-ink/10 object-contain"
                />
                <a
                  href={qrUrl}
                  download
                  className="mt-2 inline-block text-xs font-semibold text-brand-primary underline"
                >
                  Download the code
                </a>
              </>
            ) : (
              // Honest rather than a broken image: the partner has not uploaded
              // one, and the owner needs to know to ask rather than to wait.
              <p className="mt-2 rounded-lg bg-brand-surface px-3 py-2 text-sm text-plum-ink/60">
                {partnerName} has not added a payment code yet. Message them for their
                payment details.
              </p>
            )}
            {instructions && (
              <p className="mt-2 whitespace-pre-line text-sm text-plum-ink/70">{instructions}</p>
            )}
          </div>

          <form action={upload}>
            <p className="text-sm font-semibold text-plum-ink">2. Upload your receipt</p>
            <p className="mt-0.5 text-xs text-plum-ink/50">
              A screenshot of the transfer is enough.
            </p>
            <input
              type="file"
              name="receipt"
              accept="image/jpeg,image/png,image/webp"
              required
              className="mt-2 block w-full text-sm"
            />
            <button
              disabled={uploading}
              className="mt-3 min-h-[44px] rounded-full px-5 text-sm font-semibold btn-brand text-white disabled:opacity-50"
            >
              {uploading ? "Sending…" : "Send receipt"}
            </button>
            {upState?.error && <p className="mt-2 text-sm text-guava">{upState.error}</p>}
          </form>
        </div>
      )}
    </div>
  );
}
