import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { ALL_FEATURES, isFeature, type Feature } from "@/lib/billing/features";

/**
 * Features a restaurant OWNS outright from a one-time purchase, independent of
 * any plan. Deliberately free of feature-gate imports so feature-gate can use
 * it without a cycle.
 */

/**
 * The `addon` value stored for a feature. Custom domain shipped first under the
 * snake_case module name, so it keeps that key — existing paid rows must not
 * stop working.
 */
export function addonKeyFor(feature: Feature): string {
  return feature === "customDomain" ? "custom_domain" : feature;
}

/** Reverse of addonKeyFor. Returns null for rows that aren't a known feature. */
export function featureForAddonKey(addon: string): Feature | null {
  if (addon === "custom_domain") return "customDomain";
  return isFeature(addon) ? addon : null;
}

/**
 * Everything this restaurant has bought. Best-effort: an un-migrated table just
 * means nothing is owned yet, so gating falls back to the plan.
 */
export async function listOwnedFeatures(restaurantId: string): Promise<Set<Feature>> {
  try {
    const rows = await systemDb((tx) =>
      tx.addonPurchase.findMany({
        where: { restaurantId, status: "paid" },
        select: { addon: true },
      }),
    );
    const owned = new Set<Feature>();
    for (const r of rows) {
      const f = featureForAddonKey(r.addon);
      if (f) owned.add(f);
    }
    return owned;
  } catch {
    return new Set<Feature>();
  }
}

/** Restaurant ids owning a given feature — for super-admin listings. */
export async function listOwnersOfFeature(feature: Feature): Promise<Set<string>> {
  try {
    const rows = await systemDb((tx) =>
      tx.addonPurchase.findMany({
        where: { addon: addonKeyFor(feature), status: "paid" },
        select: { restaurantId: true },
      }),
    );
    return new Set(rows.map((r) => r.restaurantId));
  } catch {
    return new Set<string>();
  }
}

/** All sellable feature keys (stable order for UI). */
export const SELLABLE_FEATURES: readonly Feature[] = ALL_FEATURES;
