import { ALL_FEATURES, type Feature } from "@/lib/billing/features";

/**
 * One-time unlock pricing per gateable feature. Pure data so the super-admin
 * table can import it on the client too.
 *
 * `enabled` = offered for sale as a one-time unlock. Turn it off for anything
 * with a real per-use cost (SMS is metered credits, AI import burns API calls),
 * or for features you'd rather only ship inside a plan.
 */
export interface FeaturePrice {
  price: number; // centavos
  enabled: boolean;
}

export type FeaturePriceMap = Record<Feature, FeaturePrice>;

/**
 * THE ONE-TIME UNLOCK SHELF IS RETIRED.
 *
 * Servd sells one plan now — Standard, ₱999/mo, everything except the content
 * scheduler — so there is nothing left for this to sell: every feature it used
 * to price individually is in the plan.
 *
 * WHAT IS ALREADY OWNED STAYS OWNED. These rows are not deleted and
 * `owned-features` is untouched: a shop that paid ₱1,200 for loyalty keeps
 * loyalty for good, on Free, without ever being billed monthly. Taking that
 * away — or migrating those accounts onto a subscription — would break the
 * exact bargain the one-time price was.
 *
 * The prices below are kept as the historical record of what was charged, and
 * `retireOneTimeStore()` is what makes them unsellable. It is applied in
 * `normalizeFeaturePrices`, NOT just written into the defaults, because
 * `getFeaturePrices()` reads a super-admin-editable row out of the database —
 * and a stale `enabled: true` sitting in that JSON would otherwise put the shelf
 * back up on its own.
 */
export const DEFAULT_FEATURE_PRICES: FeaturePriceMap = {
  onlineOrdering: { price: 250_000, enabled: true },
  // Retired with the card gateway — never offered again. See FEATURE_META.
  onlinePayments: { price: 0, enabled: false },
  loyalty: { price: 120_000, enabled: true },
  promotions: { price: 100_000, enabled: true },
  customers: { price: 70_000, enabled: true },
  // Billed as its own ₱499/mo subscription — never a one-time buy.
  contentScheduler: { price: 0, enabled: false },
  // Metered: each text costs real money — keep it on credits, not a one-time buy.
  sms: { price: 0, enabled: false },
  // Burns API credits per import — cheap unlock, or leave off and meter it.
  aiMenuImport: { price: 30_000, enabled: false },
  // One-time ₱500 to lift the single free table QR. Every account keeps its
  // counter QR and one table QR for nothing; this buys the rest, forever.
  unlimitedTables: { price: 50_000, enabled: true },
  floorPlan: { price: 90_000, enabled: true },
  giftCards: { price: 90_000, enabled: true },
  reservations: { price: 120_000, enabled: true },
  dataExport: { price: 50_000, enabled: true },
  auditLog: { price: 60_000, enabled: true },
  offline: { price: 150_000, enabled: true },
  accounting: { price: 250_000, enabled: true },
  inventory: { price: 300_000, enabled: true },
  hr: { price: 300_000, enabled: true },
  customDomain: { price: 50_000, enabled: true },
  whiteLabel: { price: 250_000, enabled: true },
};

/** Coerce whatever is stored into a complete, safe price map. */
/**
 * The switch that took the shelf down. Nothing is sellable as a one-time unlock
 * any more; the plan includes it.
 *
 * Applied to whatever comes out of the database rather than only to the
 * defaults, so an `enabled: true` left in that JSON from before cannot put a
 * price back in front of a customer.
 */
export function retireOneTimeStore(map: FeaturePriceMap): FeaturePriceMap {
  const out = { ...map };
  for (const key of ALL_FEATURES) out[key] = { ...out[key], enabled: false };
  return out;
}

export function normalizeFeaturePrices(raw: unknown): FeaturePriceMap {
  const out = { ...DEFAULT_FEATURE_PRICES };
  if (!raw || typeof raw !== "object") return retireOneTimeStore(out);
  const r = raw as Record<string, unknown>;
  for (const key of ALL_FEATURES) {
    const v = r[key];
    if (!v || typeof v !== "object") continue;
    const row = v as Partial<FeaturePrice>;
    const price = Number(row.price);
    out[key] = {
      price: Number.isFinite(price) && price >= 0 ? Math.round(price) : out[key].price,
      enabled: typeof row.enabled === "boolean" ? row.enabled : out[key].enabled,
    };
  }
  return retireOneTimeStore(out);
}
