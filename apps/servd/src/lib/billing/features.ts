import { TIERS, type Tier } from "@/lib/billing/catalog";

/**
 * The canonical list of GATEABLE features. These are the toggles the super-admin
 * flips per plan; a restaurant's entitlements are resolved live from whichever
 * features its plan has enabled (see server/billing/feature-gate.ts).
 *
 * Pure data — safe to import in client components (the super-admin plan editor)
 * and on the server. Core capabilities that every plan always includes (QR
 * dine-in, cashier POS, kitchen display, counter ordering, split/tip, void-edit,
 * dietary tags, feedback, shift notes…) are intentionally NOT in this list:
 * they're never gated, so there's nothing to toggle.
 */
export type Feature =
  | "onlineOrdering"
  | "onlinePayments"
  | "loyalty"
  | "promotions"
  | "customers"
  | "sms"
  | "aiMenuImport"
  | "floorPlan"
  | "giftCards"
  | "reservations"
  | "dataExport"
  | "auditLog"
  | "offline"
  | "accounting"
  | "inventory"
  | "hr"
  | "customDomain"
  | "whiteLabel"
  | "contentScheduler"
  | "unlimitedTables";

export interface FeatureMeta {
  key: Feature;
  label: string;
  group: string;
  /**
   * No longer sold, and gates nothing. Kept in the list so a restaurant that
   * already bought it doesn't have the purchase silently disappear, and so
   * sanitizeFeatures() doesn't strip it out of stored plans. Hidden from the
   * feature store unless it's owned.
   */
  retired?: boolean;
  /**
   * What this actually does for a restaurant, in one sentence.
   *
   * Shown on the in-place unlock card that replaces a locked screen. It has to
   * read as "here is what you get", not "here is what you're missing" — the
   * owner is standing on the page they just tried to open, so the job is to
   * tell them what it does, not to sell them the whole catalogue.
   */
  blurb: string;
}

/** Display metadata, grouped — drives the super-admin per-plan checkboxes. */
export const FEATURE_META: FeatureMeta[] = [
  { key: "unlimitedTables", label: "Unlimited tables & QR codes", group: "Ordering & service" , blurb: "Print a QR for every table instead of just one, so diners order from where they're sitting." },
  { key: "floorPlan", label: "Visual floor plan & table status", group: "Ordering & service" , blurb: "See the room as a map — which tables are seated, waiting on food, or ready to clear." },
  { key: "reservations", label: "Reservations & waitlist", group: "Ordering & service" , blurb: "Take bookings and run a waitlist, with the table held on your floor plan." },
  { key: "onlineOrdering", label: "Online ordering website + delivery", group: "Ordering & service" , blurb: "Your own ordering website for pickup and delivery — orders drop straight into the POS." },
  // Retired. This was the PayMongo/Xendit connected-account gateway, where the
  // diner was redirected off-site to pay by card. Nobody used it and customers
  // found the extra hop confusing, so the shop's own GCash/Maya/bank QR — which
  // customers already know how to scan — is the only online payment now, and
  // that ships with online ordering rather than being sold separately.
  {
    key: "onlinePayments",
    label: "Online payments (card gateway)",
    group: "Payments",
    retired: true,
    blurb: "Retired — customers pay by scanning your own GCash, Maya or bank QR instead.",
  },
  { key: "giftCards", label: "Gift cards & store credit", group: "Payments" , blurb: "Sell gift cards and store credit, and redeem them at the till." },
  { key: "loyalty", label: "Loyalty & rewards", group: "Marketing & growth" , blurb: "Points and rewards that bring regulars back, tracked automatically on every order." },
  { key: "promotions", label: "Promotions, promo codes & happy hours", group: "Marketing & growth" , blurb: "Promo codes, discounts and happy-hour pricing that apply themselves at checkout." },
  { key: "customers", label: "Customer book + CSV export", group: "Marketing & growth" , blurb: "Every customer who has ordered, with their history and address — exportable to CSV." },
  { key: "sms", label: "SMS marketing", group: "Marketing & growth" , blurb: "Text your customers about promos and updates." },
  { key: "contentScheduler", label: "Social content scheduler", group: "Marketing & growth" , blurb: "Write and schedule your social posts ahead of time." },
  { key: "aiMenuImport", label: "AI menu import", group: "Marketing & growth" , blurb: "Photograph a printed menu and have it typed up for you." },
  { key: "dataExport", label: "Data export (sales, orders, menu)", group: "Operations & back office" , blurb: "Download your sales, orders and menu as spreadsheets." },
  { key: "auditLog", label: "Audit log (who changed what)", group: "Operations & back office" , blurb: "A record of who changed what — voids, discounts, price edits, refunds." },
  { key: "offline", label: "Offline mode (keep taking orders)", group: "Operations & back office" , blurb: "Keep taking orders when the internet drops; everything syncs once it's back." },
  { key: "accounting", label: "Accounting (sales, VAT, P&L)", group: "Operations & back office" , blurb: "Sales, VAT and profit worked out for you, with expenses and cost of goods." },
  { key: "inventory", label: "Inventory, COGS, low-stock & reorder", group: "Operations & back office" , blurb: "Count stock, cost your recipes, and get told before you run out." },
  { key: "hr", label: "HR, attendance & payroll", group: "Operations & back office" , blurb: "Attendance, shifts and payroll for your staff." },
  { key: "customDomain", label: "Custom domain", group: "Branding" , blurb: "Run your ordering site on your own web address instead of a Servd link." },
  { key: "whiteLabel", label: "Full white-label (remove “Powered by Servd”)", group: "Branding" , blurb: "Remove \u201cPowered by Servd\u201d so the site is entirely yours." },
];

export const ALL_FEATURES: Feature[] = FEATURE_META.map((f) => f.key);

const FEATURE_SET = new Set<string>(ALL_FEATURES);

/** Type-guard: is an arbitrary string one of our known features? */
export function isFeature(x: string): x is Feature {
  return FEATURE_SET.has(x);
}

/** Drop unknown keys (e.g. a feature retired since the row was written). */
export function sanitizeFeatures(list: readonly string[]): Feature[] {
  return ALL_FEATURES.filter((f) => list.includes(f));
}

/**
 * Default feature→tier mapping. This seeds new plans and is the FALLBACK when a
 * plan's features haven't been configured yet (e.g. before the migration runs).
 * Once a plan is saved from the editor, its stored features are authoritative.
 */
export const FEATURE_TIERS: Record<Feature, Tier[]> = {
  onlineOrdering: ["Free", "Growth", "Business"],
  onlinePayments: ["Growth", "Business"],
  loyalty: ["Growth", "Business"],
  promotions: ["Growth", "Business"],
  customers: ["Growth", "Business"],
  sms: ["Growth", "Business"],
  aiMenuImport: ["Growth", "Business"],
  floorPlan: ["Growth", "Business"],
  giftCards: ["Growth", "Business"],
  reservations: ["Growth", "Business"],
  dataExport: ["Growth", "Business"],
  customDomain: ["Growth", "Business"],
  auditLog: ["Business"],
  offline: ["Business"],
  accounting: ["Business"],
  inventory: ["Business"],
  hr: ["Business"],
  whiteLabel: ["Business"],
  // Sold separately as a monthly subscription — no plan includes it.
  contentScheduler: [],
  // Sold as a one-time ₱500 unlock, not with a plan. Every account gets its
  // counter QR and one table QR free; more is a purchase. Accounts that
  // predate the change are grandfathered on the restaurant row instead.
  unlimitedTables: [],
};

/** Map a plan name to a known tier, if it is one. */
export function asTier(name: string | null | undefined): Tier | null {
  return name && (TIERS as readonly string[]).includes(name) ? (name as Tier) : null;
}

/** The default feature set for a tier (used to seed/fallback). */
export function defaultFeaturesForTier(tier: Tier | null): Feature[] {
  if (!tier) return [];
  return ALL_FEATURES.filter((f) => FEATURE_TIERS[f].includes(tier));
}

/** The lowest-priced plan tier that includes a feature (e.g. which plan to upgrade to). */
export function planForFeature(feature: Feature): Tier | null {
  const tiers = FEATURE_TIERS[feature] ?? [];
  return TIERS.find((t) => tiers.includes(t)) ?? null;
}
