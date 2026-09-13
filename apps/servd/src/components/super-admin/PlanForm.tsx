"use client";

import { useActionState } from "react";
import { createPlan, updatePlan, type ActionState } from "@/server/billing/super-admin-actions";
import type { PlanRow } from "@/server/billing/super-admin";
import { FEATURE_META } from "@/lib/billing/features";

const MODULES: { key: string; label: string }[] = [
  { key: "inventory", label: "Inventory" },
  { key: "hris", label: "HR / payroll" },
  { key: "custom_domain", label: "Custom domain" },
];

// Feature toggles grouped for the editor (order follows FEATURE_META).
const FEATURE_GROUPS = FEATURE_META.reduce<{ group: string; items: typeof FEATURE_META }[]>(
  (acc, meta) => {
    const last = acc[acc.length - 1];
    if (last && last.group === meta.group) last.items.push(meta);
    else acc.push({ group: meta.group, items: [meta] });
    return acc;
  },
  [],
);

/**
 * Create or edit a plan. When `plan` is provided it edits in place; otherwise it
 * creates a new one. Prices are entered in pesos and converted to centavos.
 */
export function PlanForm({ plan }: { plan?: PlanRow }) {
  const action = plan ? updatePlan : createPlan;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);

  const field = "w-full rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm";
  const label = "mb-1 block text-[11px] font-semibold uppercase text-plum-ink/40";

  return (
    <form action={formAction} className="space-y-3 rounded-tile border border-plum-ink/10 bg-white p-4">
      {plan && <input type="hidden" name="id" value={plan.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Name</label>
          <input name="name" defaultValue={plan?.name} required className={field} />
        </div>
        <div>
          <label className={label}>Price (₱ / month)</label>
          <input
            name="price"
            type="number"
            min="0"
            step="1"
            defaultValue={plan ? plan.priceMonthly / 100 : ""}
            required
            className={field}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className={label}>Trial days</label>
          <input name="trialDays" type="number" min="0" max="365" defaultValue={plan?.trialDays ?? 30} className={field} />
        </div>
        <div>
          <label className={label}>Max tables</label>
          <input name="maxTables" type="number" min="0" defaultValue={plan?.limits.maxTables ?? ""} className={field} />
        </div>
        <div>
          <label className={label}>Max staff</label>
          <input name="maxStaff" type="number" min="0" defaultValue={plan?.limits.maxStaff ?? ""} className={field} />
        </div>
        <div>
          <label className={label}>SMS included</label>
          <input name="smsIncluded" type="number" min="0" defaultValue={plan?.limits.smsIncluded ?? ""} className={field} />
        </div>
      </div>

      <div>
        <label className={label}>Add-on modules</label>
        <div className="flex flex-wrap gap-3">
          {MODULES.map((m) => (
            <label key={m.key} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                name={`module_${m.key}`}
                defaultChecked={plan?.modules.includes(m.key)}
              />
              {m.label}
            </label>
          ))}
        </div>
      </div>

      {/* Per-plan feature control. Toggling these applies live to every
          subscription currently on this plan. */}
      <div className="rounded-lg border border-plum-ink/10 bg-cream/40 p-3">
        <label className={label}>Included features</label>
        <p className="mb-2 -mt-0.5 text-xs text-plum-ink/45">
          Tick what this plan unlocks. Changes apply immediately to every restaurant on the plan.
          (Core ordering, POS &amp; kitchen are always included.)
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {FEATURE_GROUPS.map((g) => (
            <div key={g.group}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-plum-ink/40">
                {g.group}
              </p>
              <div className="space-y-1">
                {g.items.map((f) => (
                  <label key={f.key} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name={`feature_${f.key}`}
                      defaultChecked={plan?.features.includes(f.key)}
                      className="mt-0.5"
                    />
                    <span>{f.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          disabled={pending}
          className="rounded-full px-4 py-2 text-sm font-semibold btn-brand disabled:opacity-60"
        >
          {pending ? "Saving…" : plan ? "Save changes" : "Create plan"}
        </button>
        {state?.error && <p className="text-sm text-guava">{state.error}</p>}
        {state?.ok && <p className="text-sm text-mango">{state.message ?? "Saved."}</p>}
      </div>
    </form>
  );
}
