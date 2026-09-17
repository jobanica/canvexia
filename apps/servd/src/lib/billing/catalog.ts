/**
 * Plan tiers.
 *
 * SERVD SELLS ONE PLAN: Standard, ₱999/mo, every gateable feature except the
 * content scheduler — which stays on its own ₱499/mo subscription, as it always
 * has.
 *
 * Before this, Servd sold no monthly plan at all. `Free`, `Growth` and
 * `Business` survived as database rows with empty feature arrays, and the real
 * pricing was a shelf of one-time unlocks. That shelf is retired (see
 * lib/billing/feature-pricing.ts) and those two paid tiers are deactivated.
 *
 * FREE AND THE TWO OLD TIERS STAY IN THIS LIST, and that is not tidying left
 * undone. `Free` is the live downgrade target when a trial lapses and the home
 * of every grandfathered account; `Growth` and `Business` still name rows that
 * historical invoices and old subscriptions point at, and `asTier()` has to keep
 * resolving them or those accounts silently fall through to "unknown plan",
 * which `getPlanAccess` reads as ALL_FEATURES.
 */

export const TIERS = ["Free", "Growth", "Standard", "Business"] as const;
export type Tier = (typeof TIERS)[number];

/** The only tier sold. ₱999/mo, in centavos. */
export const STANDARD_PRICE = 99_900;
export const STANDARD_TIER = "Standard" as const;
