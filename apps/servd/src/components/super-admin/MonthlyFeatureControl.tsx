"use client";

import { useActionState } from "react";
import {
  grantMonthlyFeature,
  revokeMonthlyFeature,
  type ActionState,
} from "@/server/billing/super-admin-actions";

/**
 * Switch a monthly-billed feature on or off for one account, without payment.
 *
 * Separate from "Grant full access" on purpose, and worth saying why on screen:
 * these features are excluded from plan grants and from the trial's blanket
 * unlock, so full access genuinely does NOT include them. Somebody who assumed
 * it did would grant full access, watch the feature stay locked, and have no
 * idea what they were looking at.
 */
export function MonthlyFeatureControl({
  restaurantId,
  features,
}: {
  restaurantId: string;
  /** Every monthly feature, with whether this account currently has it. */
  features: { key: string; label: string; priceMonthly: number; active: boolean }[];
}) {
  const [grantState, grantAction, granting] = useActionState<ActionState, FormData>(
    grantMonthlyFeature,
    null,
  );
  const [revokeState, revokeAction, revoking] = useActionState<ActionState, FormData>(
    revokeMonthlyFeature,
    null,
  );

  const error = grantState?.error || revokeState?.error;
  const ok = grantState?.ok ? grantState.message : revokeState?.ok ? revokeState.message : null;

  if (features.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-plum-ink/45">
        Monthly add-ons — not included in full access
      </p>
      {features.map((f) => (
        <div key={f.key} className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-plum-ink">
            {f.label}{" "}
            <span className="text-plum-ink/40">₱{(f.priceMonthly / 100).toFixed(0)}/mo</span>
          </span>
          {f.active ? (
            <>
              <span className="rounded-full bg-mango/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-plum-ink">
                On
              </span>
              <form action={revokeAction}>
                <input type="hidden" name="restaurantId" value={restaurantId} />
                <input type="hidden" name="feature" value={f.key} />
                <button
                  disabled={revoking}
                  className="rounded border border-plum-ink/15 px-2 py-1 text-xs font-semibold hover:bg-cream disabled:opacity-60"
                >
                  {revoking ? "…" : "Switch off"}
                </button>
              </form>
            </>
          ) : (
            <form action={grantAction}>
              <input type="hidden" name="restaurantId" value={restaurantId} />
              <input type="hidden" name="feature" value={f.key} />
              <button
                disabled={granting}
                className="rounded bg-brand-gradient px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
              >
                {granting ? "…" : "Switch on (free)"}
              </button>
            </form>
          )}
        </div>
      ))}
      {error && <p className="break-words text-xs text-guava">⚠ {error}</p>}
      {!error && ok && <p className="text-xs text-mango">{ok}</p>}
    </div>
  );
}
