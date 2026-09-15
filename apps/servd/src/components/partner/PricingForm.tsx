"use client";

import { useActionState } from "react";
import { setPlanPriceAction, type PricingState } from "@/server/partners/pricing-actions";
import type { PlanPriceRow } from "@/server/partners/revenue";

const initial: PricingState = { status: "idle" };

const peso = (c: number) => `₱${Math.round(c / 100).toLocaleString("en-PH")}`;

export function PricingForm({ row }: { row: PlanPriceRow }) {
  const [state, action, pending] = useActionState(setPlanPriceAction, initial);
  const current = row.partnerCentavos ?? row.catalogCentavos;

  return (
    <form action={action} className="rounded-tile border border-brand-ink/10 bg-white p-5">
      <input type="hidden" name="planId" value={row.planId} />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-heading text-lg font-bold">{row.planName}</p>
        <p className="text-xs text-brand-ink/50">
          CANVEXIA lists it at {peso(row.catalogCentavos)}
          {row.floorCentavos > 0 && ` · floor ${peso(row.floorCentavos)}`}
        </p>
      </div>

      <label className="mt-4 block">
        <span className="text-xs font-semibold text-brand-ink/60">
          What you charge, per month
        </span>
        <span className="mt-1 flex items-center rounded-lg border border-brand-ink/15 bg-white focus-within:border-brand-ink">
          <span className="pl-3 text-brand-ink/45">₱</span>
          <input
            name="pricePesos"
            inputMode="numeric"
            defaultValue={Math.round(current / 100)}
            className="min-h-[46px] w-full bg-transparent px-2 text-base tabular-nums outline-none"
          />
        </span>
      </label>

      <label className="mt-3 flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          name="applyToExisting"
          defaultChecked={row.applyToExisting}
          className="mt-1 h-4 w-4"
        />
        <span>
          Apply to merchants already on this plan
          <span className="mt-0.5 block text-xs text-brand-ink/50">
            {/* Said plainly, because it changes what somebody already agreed to
                pay. Leaving it off is the safe default and the one that needs no
                conversation. */}
            They move to the new price on their next billing cycle, not today.
            Merchants notice price changes.
          </span>
        </span>
      </label>

      {state.status === "error" && (
        <p role="alert" className="mt-3 rounded-lg bg-guava/10 px-3 py-2 text-sm text-guava">
          {state.message}
        </p>
      )}
      {state.status === "done" && (
        <p className="mt-3 text-sm text-brand-primary">{state.message}</p>
      )}

      <button
        disabled={pending}
        className="mt-4 min-h-[44px] rounded-full bg-brand-ink px-6 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save price"}
      </button>
    </form>
  );
}
