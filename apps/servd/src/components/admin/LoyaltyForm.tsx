"use client";

import { useActionState } from "react";
import { updateLoyaltyConfig, type LoyaltyFormState } from "@/server/loyalty/actions";
import { SubmitButton } from "./SubmitButton";

export function LoyaltyForm({
  initial,
}: {
  initial: { enabled: boolean; pesosPerPoint: number; pointValuePesos: number };
}) {
  const [state, action] = useActionState<LoyaltyFormState, FormData>(updateLoyaltyConfig, null);

  return (
    <form action={action} className="max-w-xl space-y-5 rounded-tile border border-plum-ink/10 bg-white p-5">
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="enabled" defaultChecked={initial.enabled} />
        Enable loyalty &amp; rewards
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-semibold">Earn rate</label>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sm text-plum-ink/60">₱</span>
            <input
              name="pesosPerPoint"
              type="number"
              min={1}
              defaultValue={initial.pesosPerPoint}
              className="w-24 rounded-lg border border-plum-ink/15 px-3 py-2"
            />
            <span className="text-sm text-plum-ink/60">spent = 1 point</span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold">Point value</label>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sm text-plum-ink/60">1 point = ₱</span>
            <input
              name="pointValue"
              type="number"
              min={0.01}
              step={0.01}
              defaultValue={initial.pointValuePesos}
              className="w-24 rounded-lg border border-plum-ink/15 px-3 py-2"
            />
          </div>
        </div>
      </div>

      <p className="rounded-lg bg-cream px-3 py-2 text-xs text-plum-ink/60">
        Example: at ₱{initial.pesosPerPoint}/point and ₱{initial.pointValuePesos}/point, a ₱500 order
        earns {Math.floor(500 / initial.pesosPerPoint)} points worth ₱
        {(Math.floor(500 / initial.pesosPerPoint) * initial.pointValuePesos).toFixed(2)}.
      </p>

      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      {state?.ok && <p className="text-sm text-mango">Saved.</p>}
      <SubmitButton>Save loyalty settings</SubmitButton>
    </form>
  );
}
