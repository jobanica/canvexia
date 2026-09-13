"use client";

import { useActionState } from "react";
import { runBillingNow, type CronState } from "@/server/billing/super-admin-actions";

/**
 * Triggers the daily billing cycle on demand and shows the result. The cron
 * normally runs from /api/cron/billing; this is a manual kick for the operator.
 */
export function BillingRunButton() {
  const [state, action, pending] = useActionState<CronState, FormData>(runBillingNow, null);

  return (
    <form action={action} className="rounded-tile border border-plum-ink/10 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Billing run</p>
          <p className="text-xs text-plum-ink/50">
            Charge due cards, run dunning, suspend non-payers. Safe to run anytime — it&apos;s
            idempotent.
          </p>
        </div>
        <button
          disabled={pending}
          className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold btn-brand disabled:opacity-60"
        >
          {pending ? "Running…" : "Run now"}
        </button>
      </div>
      {state?.error && <p className="mt-2 text-sm text-guava">{state.error}</p>}
      {state?.ok && state.summary && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-6">
          {(
            [
              ["Processed", state.summary.processed],
              ["Charged", state.summary.charged],
              ["Failed", state.summary.failed],
              ["Awaiting", state.summary.awaiting],
              ["Suspended", state.summary.suspended],
              ["Features renewed", state.summary.featuresRenewed],
              ["Feature invoices", state.summary.featuresInvoiced],
              ["Features lapsed", state.summary.featuresLapsed],
              ["Cancelled", state.summary.cancelled],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-lg bg-cream p-2">
              <p className="font-heading text-lg font-extrabold">{value}</p>
              <p className="text-plum-ink/50">{label}</p>
            </div>
          ))}
        </div>
      )}
    </form>
  );
}
