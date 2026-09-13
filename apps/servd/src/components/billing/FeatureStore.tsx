"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FEATURE_META, type Feature } from "@/lib/billing/features";
import { startFeatureUnlock, verifyFeatureUnlock } from "@/server/billing/addon-actions";

export interface StoreRow {
  key: Feature;
  label: string;
  group: string;
  pricePesos: number;
  owned: boolean; // bought outright — permanent
  includedInPlan: boolean; // granted by the current plan/trial
  sellable: boolean;
  pending: boolean; // checkout started, not settled
}

/**
 * The one-time feature store. Everything is bought once and kept forever — the
 * only recurring charge is the monthly order allowance, handled elsewhere.
 */
export function FeatureStore({ rows }: { rows: StoreRow[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ key: string; text: string } | null>(null);
  const router = useRouter();

  async function buy(key: Feature) {
    setBusy(key);
    setMsg(null);
    const res = await startFeatureUnlock(key);
    if ("checkoutUrl" in res) {
      window.location.href = res.checkoutUrl;
      return;
    }
    setBusy(null);
    setMsg({ key, text: res.error });
  }

  async function verify(key: Feature) {
    setBusy(key);
    setMsg(null);
    const res = await verifyFeatureUnlock(key);
    setBusy(null);
    if (res.unlocked) {
      router.refresh();
      return;
    }
    setMsg({ key, text: res.message });
  }

  const groups = [...new Set(FEATURE_META.map((f) => f.group))];
  const peso = (n: number) => `₱${n.toLocaleString("en-PH")}`;

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const items = rows.filter((r) => r.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group} className="overflow-hidden rounded-tile border border-plum-ink/10 bg-white">
            <div className="border-b border-plum-ink/10 px-4 py-2.5">
              <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-plum-ink/55">{group}</h3>
            </div>
            <ul className="divide-y divide-plum-ink/[0.06]">
              {items.map((r) => (
                <li key={r.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-plum-ink">{r.label}</p>
                    {r.owned ? (
                      <p className="text-xs font-semibold text-mango">✓ Yours — paid once, kept forever</p>
                    ) : r.includedInPlan ? (
                      <p className="text-xs text-plum-ink/50">Included with your current plan</p>
                    ) : r.sellable ? (
                      <p className="text-xs text-plum-ink/50">One-time · no monthly fee</p>
                    ) : (
                      <p className="text-xs text-plum-ink/40">Not sold separately</p>
                    )}
                    {msg?.key === r.key && <p className="mt-1 text-xs text-guava">{msg.text}</p>}
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    {!r.owned && !r.includedInPlan && r.sellable && (
                      <span className="font-heading text-lg font-extrabold text-plum-ink">
                        {peso(r.pricePesos)}
                      </span>
                    )}
                    {r.owned ? (
                      <span className="rounded-full bg-mango/15 px-3 py-1.5 text-xs font-bold text-mango">Owned</span>
                    ) : r.includedInPlan ? (
                      <span className="rounded-full bg-plum-ink/5 px-3 py-1.5 text-xs font-semibold text-plum-ink/50">
                        Included
                      </span>
                    ) : r.sellable ? (
                      <div className="text-right">
                        <button
                          type="button"
                          onClick={() => buy(r.key)}
                          disabled={busy === r.key}
                          className="rounded-full px-4 py-2 text-sm font-semibold btn-brand disabled:opacity-50"
                        >
                          {busy === r.key ? "…" : "Unlock"}
                        </button>
                        {r.pending && (
                          <button
                            type="button"
                            onClick={() => verify(r.key)}
                            disabled={busy === r.key}
                            className="mt-1 block w-full text-[11px] font-semibold text-brand-primary underline"
                          >
                            Already paid? Check
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
