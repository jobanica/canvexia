import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import type { Tier } from "@/lib/billing/catalog";
import {
  ALL_FEATURES,
  asTier,
  defaultFeaturesForTier,
  sanitizeFeatures,
  type Feature,
} from "@/lib/billing/features";
import { listOwnedFeatures } from "@/server/billing/owned-features";
import { listActiveMonthlyFeatures, isMonthlyFeature } from "@/server/billing/feature-subscriptions";

/**
 * Plan-based feature gating. Entitlements are resolved LIVE from the features
 * the super-admin has enabled on the restaurant's plan, so adding/removing a
 * feature on a plan instantly applies to every subscription on it. A paid-plan
 * free trial unlocks everything for its duration.
 *
 * If a plan has no features configured yet (e.g. before the migration runs), we
 * fall back to the default feature→tier mapping by plan name.
 */

export type { Feature };

export interface PlanAccess {
  tier: Tier | null;
  onTrial: boolean;
  /** The features this restaurant's plan currently grants. */
  features: Set<Feature>;
}

/** The restaurant's effective tier, trial state, and the plan's enabled features. */
export async function getPlanAccess(restaurantId: string): Promise<PlanAccess> {
  try {
    // systemDb so this also works from public routes (no tenant context).
    return await systemDb(async (tx) => {
      const sub = await tx.subscription.findFirst({
        where: { restaurantId },
        orderBy: { createdAt: "desc" },
        select: { status: true, trialEndsAt: true, plan: { select: { name: true, features: true } } },
      });
      const isTrialing = sub?.status === "trialing";
      const onTrial = isTrialing && sub?.trialEndsAt != null && sub.trialEndsAt.getTime() > Date.now();
      // A "trialing" subscription past its window is an UNPAID selection (picking a
      // paid plan without a card, or a lapsed signup trial). It must grant only
      // Free-tier access until payment flips the status to "active" — otherwise a
      // post-trial account could switch to Growth/Business and get it for free.
      const lapsed = isTrialing && !onTrial;
      const tier = lapsed ? "Free" : asTier(sub?.plan?.name);
      const tierDefaults = tier ? defaultFeaturesForTier(tier) : ALL_FEATURES;
      const stored = lapsed ? [] : sanitizeFeatures(sub?.plan?.features ?? []);
      // A live trial unlocks EVERY feature. Off-trial, the plan's stored features
      // are authoritative (falling back to tier defaults; unknown plan → open).
      const features = new Set<Feature>(
        onTrial ? ALL_FEATURES : stored.length ? stored : tierDefaults,
      );
      return { tier, onTrial, features };
    });
  } catch {
    // `plan.features` column not migrated yet → resolve from tier defaults.
    return getPlanAccessByTier(restaurantId);
  }
}

/** Legacy/pre-migration path: resolve entitlements from the plan name's tier. */
async function getPlanAccessByTier(restaurantId: string): Promise<PlanAccess> {
  try {
    return await systemDb(async (tx) => {
      const sub = await tx.subscription.findFirst({
        where: { restaurantId },
        orderBy: { createdAt: "desc" },
        select: { status: true, trialEndsAt: true, plan: { select: { name: true } } },
      });
      const isTrialing = sub?.status === "trialing";
      const onTrial = isTrialing && sub?.trialEndsAt != null && sub.trialEndsAt.getTime() > Date.now();
      // Lapsed/unpaid trial → Free access until they pay (see getPlanAccess).
      const lapsed = isTrialing && !onTrial;
      const tier = lapsed ? "Free" : asTier(sub?.plan?.name);
      const features = new Set<Feature>(
        onTrial ? ALL_FEATURES : tier ? defaultFeaturesForTier(tier) : ALL_FEATURES,
      );
      return { tier, onTrial, features };
    });
  } catch {
    return { tier: null, onTrial: false, features: new Set(ALL_FEATURES) };
  }
}

/**
 * Whether the restaurant's plan includes a feature. A trial unlocks the features
 * of the plan being trialed (Growth trial → Growth features, not Business) — the
 * `features` set is already resolved from that plan, so there's no blanket
 * trial override.
 */
export async function hasFeature(restaurantId: string, feature: Feature): Promise<boolean> {
  const features = await getEntitledFeatures(restaurantId);
  return features.has(feature);
}

/**
 * The full set of features the restaurant currently has access to: whatever its
 * plan grants, PLUS anything bought outright as a one-time unlock. Owned
 * features are permanent — they survive a plan change or downgrade.
 */
export async function getEntitledFeatures(restaurantId: string): Promise<Set<Feature>> {
  const [{ features }, owned, monthly] = await Promise.all([
    getPlanAccess(restaurantId),
    listOwnedFeatures(restaurantId),
    listActiveMonthlyFeatures(restaurantId),
  ]);
  const all = new Set(features);
  for (const f of owned) all.add(f);
  // Features billed as their own monthly subscription are NEVER granted by a
  // plan or by the trial's blanket unlock — only by a paid, live subscription.
  for (const f of all) if (isMonthlyFeature(f)) all.delete(f);
  for (const f of monthly) all.add(f);
  return all;
}

// requireFeaturePage() used to live here and redirect a locked page to
// /admin/billing?upgrade=<feature>. It's gone: landing on a list of eighteen
// priced features reads as a bill rather than an offer, and the one thing the
// owner actually wanted was buried in it. Locked pages now render their own
// unlock in place — see server/billing/feature-lock-gate.

export interface TrialInfo {
  onTrial: boolean;
  trialEndsAt: string | null; // ISO
  planName: string | null;
}

/** Trial status for the dashboard countdown banner. Safe before migrations. */
export async function getTrialInfo(restaurantId: string): Promise<TrialInfo> {
  try {
    return await systemDb(async (tx) => {
      const sub = await tx.subscription.findFirst({
        where: { restaurantId },
        orderBy: { createdAt: "desc" },
        select: { status: true, trialEndsAt: true, plan: { select: { name: true } } },
      });
      const onTrial =
        sub?.status === "trialing" && sub.trialEndsAt != null && sub.trialEndsAt.getTime() > Date.now();
      return {
        onTrial,
        trialEndsAt: sub?.trialEndsAt ? sub.trialEndsAt.toISOString() : null,
        planName: sub?.plan?.name ?? null,
      };
    });
  } catch {
    return { onTrial: false, trialEndsAt: null, planName: null };
  }
}

