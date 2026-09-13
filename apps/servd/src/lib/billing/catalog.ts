/**
 * Legacy plan tiers.
 *
 * SERVD NO LONGER SELLS A MONTHLY PLAN. Everyone is on Free, and everything
 * paid is a one-time unlock (see lib/billing/feature-pricing.ts) — except the
 * content scheduler, which is its own monthly subscription.
 *
 * What survives here is the TIER NAME, and only because plan rows still exist
 * in the database for accounts provisioned under the old model, and the feature
 * gate resolves those names to a default feature set. Nothing here is a price
 * and nothing here is shown to a customer.
 *
 * The marketing catalogue that used to live in this file — ₱899 Growth, ₱1,799
 * Business, the comparison table and the plan cards — is deleted. It hadn't
 * been rendered anywhere for a while, which made it worse than useless: it read
 * like current pricing to anyone who opened the file, and it was.
 */

export const TIERS = ["Free", "Growth", "Business"] as const;
export type Tier = (typeof TIERS)[number];
