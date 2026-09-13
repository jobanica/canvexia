import "server-only";

import { FEATURE_META, type Feature } from "@/lib/billing/features";
import { getPlanAccess } from "@/server/billing/feature-gate";
import { getFeaturePrices } from "@/server/billing/feature-pricing";
import { listOwnedFeatures, addonKeyFor } from "@/server/billing/owned-features";
import { tenantDb } from "@/server/tenancy/scoped-db";

/**
 * Everything a locked screen needs to sell its own unlock.
 *
 * Locked pages used to say "go to Billing" and send the owner to a page listing
 * every paid feature at once. That reads as a bill, not an offer — somebody who
 * wanted inventory ends up looking at eighteen prices and closes the tab. So the
 * unlock happens where they already are, priced for the one thing they came for.
 */

export interface FeatureLock {
  feature: Feature;
  /** They already have it — render the real page. */
  allowed: boolean;
  label: string;
  blurb: string;
  /** One-time price in centavos. Zero when it isn't sold this way. */
  price: number;
  /** Offered as a one-time unlock at all (SMS is metered, the scheduler is monthly). */
  sellable: boolean;
  /** Bought outright — permanent. */
  owned: boolean;
  /** A checkout was started and hasn't settled yet. */
  pending: boolean;
}

export async function getFeatureLock(
  restaurantId: string,
  feature: Feature,
): Promise<FeatureLock> {
  const meta = FEATURE_META.find((f) => f.key === feature)!;

  const [access, owned, prices, pendingRows] = await Promise.all([
    getPlanAccess(restaurantId),
    listOwnedFeatures(restaurantId).catch(() => new Set<Feature>()),
    getFeaturePrices(),
    tenantDb(restaurantId, (tx) =>
      tx.addonPurchase.findMany({ where: { status: "pending" }, select: { addon: true } }),
    ).catch(() => [] as { addon: string }[]),
  ]);

  const priced = prices[feature];
  return {
    feature,
    // The live trial unlocks everything, and that's deliberate — it's how a new
    // shop sees what they're buying. getPlanAccess already reflects it.
    allowed: access.features.has(feature) || owned.has(feature),
    label: meta.label,
    blurb: meta.blurb,
    price: priced.price,
    sellable: priced.enabled && priced.price > 0,
    owned: owned.has(feature),
    pending: pendingRows.some((r) => r.addon === addonKeyFor(feature)),
  };
}
