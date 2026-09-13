"use client";

import { useActionState, useMemo, useState } from "react";
import { FEATURE_META, type Feature } from "@/lib/billing/features";
import type { FeaturePriceMap } from "@/lib/billing/feature-pricing";
import { updateFeaturePrices, type PricingState } from "@/server/billing/feature-pricing-actions";
import { SubmitButton } from "@/components/admin/SubmitButton";

/**
 * Editable one-time price per feature. Prices are entered in PESOS here and
 * converted to centavos on save. The running total mirrors what a customer
 * would pay to buy every sellable feature outright.
 */
export function FeaturePricingTable({ initial }: { initial: FeaturePriceMap }) {
  const [state, action] = useActionState<PricingState, FormData>(updateFeaturePrices, null);
  // Local mirror so the total updates as you type.
  const [rows, setRows] = useState(() => {
    const seed: Record<string, { pesos: string; enabled: boolean }> = {};
    for (const f of FEATURE_META) {
      seed[f.key] = { pesos: String(initial[f.key].price / 100), enabled: initial[f.key].enabled };
    }
    return seed;
  });

  const setRow = (key: Feature, patch: Partial<{ pesos: string; enabled: boolean }>) =>
    setRows((p) => ({ ...p, [key]: { ...p[key], ...patch } }));

  const groups = useMemo(() => {
    const map = new Map<string, typeof FEATURE_META>();
    for (const f of FEATURE_META) {
      const list = map.get(f.group) ?? [];
      list.push(f);
      map.set(f.group, list);
    }
    return [...map.entries()];
  }, []);

  const { total, sellable } = useMemo(() => {
    let total = 0;
    let sellable = 0;
    for (const f of FEATURE_META) {
      const r = rows[f.key];
      if (!r?.enabled) continue;
      sellable += 1;
      total += Number(r.pesos) || 0;
    }
    return { total, sellable };
  }, [rows]);

  return (
    <form action={action} className="space-y-5">
      {/* Sticky summary + save */}
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-b border-plum-ink/10 bg-cream/95 px-4 py-3 backdrop-blur">
        <SubmitButton>Save prices</SubmitButton>
        <span className="text-sm text-plum-ink/60">
          {sellable} sellable · buy-everything total{" "}
          <span className="font-heading font-extrabold text-plum-ink">
            ₱{total.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </span>
        {state?.ok && <span className="text-sm font-semibold text-mango">Saved.</span>}
        {state?.error && <span className="text-sm font-semibold text-guava">{state.error}</span>}
      </div>

      {groups.map(([group, feats]) => (
        <div key={group} className="overflow-hidden rounded-tile border border-plum-ink/10 bg-white">
          <div className="border-b border-plum-ink/10 px-4 py-2.5">
            <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-plum-ink/55">{group}</h2>
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-plum-ink/10 text-[11px] uppercase tracking-wide text-plum-ink/45">
                <th className="px-4 py-2 font-semibold">Feature</th>
                <th className="w-40 px-3 py-2 font-semibold">One-time price</th>
                <th className="w-32 px-4 py-2 text-right font-semibold">Sell it?</th>
              </tr>
            </thead>
            <tbody>
              {feats.map((f) => {
                const r = rows[f.key];
                return (
                  <tr key={f.key} className={`border-b border-plum-ink/[0.06] ${r.enabled ? "" : "bg-plum-ink/[0.02]"}`}>
                    <td className="px-4 py-2.5">
                      <span className={`font-medium ${r.enabled ? "text-plum-ink" : "text-plum-ink/45"}`}>
                        {f.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <span className="text-plum-ink/45">₱</span>
                        <input
                          name={`price_${f.key}`}
                          type="number"
                          step="0.01"
                          min={0}
                          value={r.pesos}
                          onChange={(e) => setRow(f.key, { pesos: e.target.value })}
                          className="w-28 rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm tabular-nums"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <label className="inline-flex items-center gap-2 text-xs font-semibold text-plum-ink/60">
                        <input
                          type="checkbox"
                          name={`on_${f.key}`}
                          checked={r.enabled}
                          onChange={(e) => setRow(f.key, { enabled: e.target.checked })}
                        />
                        {r.enabled ? "Sellable" : "Off"}
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </form>
  );
}
