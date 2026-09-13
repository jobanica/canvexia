import { FEATURE_META } from "@/lib/billing/features";
import type { FeaturePriceMap } from "@/lib/billing/feature-pricing";

/**
 * Public one-time pricing grid. Everything is bought once and kept forever —
 * there's no subscription, so this replaces the old monthly plan cards.
 * Features the owner has marked as not-sellable are simply omitted.
 */
export function OneTimePricing({ prices }: { prices: FeaturePriceMap }) {
  const groups = [...new Set(FEATURE_META.map((f) => f.group))];
  const peso = (centavos: number) => `₱${Math.round(centavos / 100).toLocaleString("en-PH")}`;

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((group) => {
        const items = FEATURE_META.filter(
          (f) => f.group === group && prices[f.key].enabled && prices[f.key].price > 0,
        );
        if (items.length === 0) return null;
        return (
          <div key={group} className="rounded-tile border border-plum-ink/10 bg-white p-5">
            <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-plum-ink/50">
              {group}
            </h3>
            <ul className="mt-3 space-y-2.5">
              {items.map((f) => (
                <li key={f.key} className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-plum-ink/80">{f.label}</span>
                  <span className="whitespace-nowrap font-heading font-extrabold text-plum-ink">
                    {peso(prices[f.key].price)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
