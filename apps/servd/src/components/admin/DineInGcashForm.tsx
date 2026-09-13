"use client";

import { useActionState, useState } from "react";
import { updateDineInGcash, type DineInGcashState } from "@/server/tables/dine-in-gcash";
import { SubmitButton } from "./SubmitButton";

/**
 * Dine-in GCash QR settings, shown on the Tables page because it's a table-QR
 * feature. The account name / number / QR are the same ones the online website
 * uses, so a store that already set up manual GCash there sees them pre-filled.
 */
export function DineInGcashForm({
  initial,
}: {
  initial: { enabled: boolean; name: string; number: string; qrUrl: string };
}) {
  const [state, action] = useActionState<DineInGcashState, FormData>(updateDineInGcash, null);
  const [enabled, setEnabled] = useState(initial.enabled);

  return (
    <form action={action} className="rounded-tile border border-plum-ink/10 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold">Pay with GCash QR</h2>
          <p className="text-sm text-plum-ink/50">
            Diners can choose GCash on their bill. Staff get an alert and bring your printed QR to
            the table — the money goes straight to your own GCash, no payment gateway and no fees.
          </p>
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          name="dineInGcashEnabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Offer GCash QR on the table bill
      </label>

      {enabled && (
        <div className="mt-3 space-y-3 rounded-lg border border-plum-ink/10 bg-cream/40 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-plum-ink/60">
                GCash account name
              </label>
              <input
                name="gcashName"
                defaultValue={initial.name}
                placeholder="e.g. Juan D."
                className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-plum-ink/60">
                GCash number
              </label>
              <input
                name="gcashNumber"
                defaultValue={initial.number}
                inputMode="tel"
                placeholder="09xx xxx xxxx"
                className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-plum-ink/60">
              GCash QR code (optional)
            </label>
            <div className="flex items-center gap-3">
              {initial.qrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={initial.qrUrl}
                  alt="GCash QR"
                  className="h-20 w-20 rounded-lg border border-plum-ink/10 object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-plum-ink/20 text-2xl">
                  📷
                </div>
              )}
              <div className="min-w-0">
                <input
                  type="file"
                  name="gcashQr"
                  accept="image/png,image/jpeg,image/webp"
                  className="text-xs"
                />
                <p className="mt-1 text-xs text-plum-ink/45">
                  Upload it and the diner can scan on their phone straight away — otherwise they
                  just wait for the waiter to bring the printed QR.
                </p>
              </div>
            </div>
            <input type="hidden" name="gcashQrUrl" value={initial.qrUrl} />
          </div>
          <p className="text-xs text-plum-ink/45">
            The cashier still confirms the payment (Take payment → GCash) once the diner shows their
            confirmation, so the order closes and the sale is recorded.
          </p>
        </div>
      )}
      {/* Switched off: keep the saved account details rather than blanking them. */}
      {!enabled && (
        <>
          <input type="hidden" name="gcashName" value={initial.name} />
          <input type="hidden" name="gcashNumber" value={initial.number} />
          <input type="hidden" name="gcashQrUrl" value={initial.qrUrl} />
        </>
      )}

      <div className="mt-4 flex items-center gap-3">
        <SubmitButton>Save</SubmitButton>
        {state?.ok && <span className="text-sm text-green-700">Saved.</span>}
        {state?.error && <span className="text-sm text-guava">{state.error}</span>}
      </div>
    </form>
  );
}
