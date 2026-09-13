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
 * One-time unlock prices. These ARE the product's pricing — there is no
 * monthly plan to compare them against any more; ₱499 activates the ordering
 * page and everything else is bought once from here.
 *
 * Editable per-feature under Super-admin → Feature pricing; these are the
 * fallback a fresh install starts from.
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
export function normalizeFeaturePrices(raw: unknown): FeaturePriceMap {
  const out = { ...DEFAULT_FEATURE_PRICES };
  if (!raw || typeof raw !== "object") return out;
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
  return out;
}
