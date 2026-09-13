import { tenantDb } from "@/server/tenancy/scoped-db";
import type { PlanModuleType } from "@prisma/client";
import { getEntitledFeatures, getPlanAccess } from "@/server/billing/feature-gate";
import type { Feature } from "@/lib/billing/features";

export interface PlanLimits {
  maxTables?: number;
  maxStaff?: number;
  smsIncluded?: number;
}

/**
 * The premium add-on modules, each mapped 1:1 to a gateable feature.
 *
 * Exported so the mapping's invariants can be pinned by a test: every module
 * here is sold as a one-time unlock, so module access MUST be resolved from the
 * set that includes purchases, and none of them may become a monthly feature
 * (getEntitledFeatures strips those, which would revoke something already paid
 * for outright).
 */
export const MODULE_FOR_FEATURE: Record<PlanModuleType, Feature> = {
  hris: "hr",
  inventory: "inventory",
  custom_domain: "customDomain",
};

export interface Entitlements {
  planName: string | null;
  limits: PlanLimits;
  modules: Set<PlanModuleType>;
  status: string; // restaurant status (active/suspended/...)
}

/**
 * Resolves what a restaurant is entitled to: its add-on modules + limits.
 *
 * MODULES COME FROM getEntitledFeatures, NOT getPlanAccess. That distinction is
 * the whole bug this once had: getPlanAccess answers "what does their PLAN
 * include", which leaves out anything bought outright as a one-time unlock. So
 * a shop that paid for HR saw "Owned — paid once, kept forever" on the billing
 * page and the buy-it-now paywall on every HR page, because the store read
 * their purchases and the gate read only their plan. Same for Inventory and the
 * custom domain — every module-gated page in the app.
 *
 * One-time unlocks are permanent and survive a plan change, so anything that
 * decides access has to read the same set. Trials still unlock only the trialed
 * plan's modules; limits stay relaxed during a trial so tiers can be tried
 * without hitting caps.
 */
export async function getEntitlements(restaurantId: string): Promise<Entitlements> {
  // Both: the tier/trial flags come from the plan, the feature set from
  // everything they actually have.
  const [access, entitled] = await Promise.all([
    getPlanAccess(restaurantId),
    getEntitledFeatures(restaurantId),
  ]);

  const modules = new Set<PlanModuleType>();
  for (const [mod, feature] of Object.entries(MODULE_FOR_FEATURE) as [PlanModuleType, Feature][]) {
    if (entitled.has(feature)) modules.add(mod);
  }

  // Status + plan limits from the restaurant row (best-effort).
  let status = "active";
  let planName: string | null = access.tier;
  let planLimits: PlanLimits = {};
  try {
    const r = await tenantDb(restaurantId, (tx) =>
      tx.restaurant.findFirstOrThrow({
        select: { status: true, plan: { select: { name: true, limits: true } } },
      }),
    );
    status = r.status;
    planName = r.plan?.name ?? planName;
    planLimits = (r.plan?.limits as PlanLimits | null) ?? {};
  } catch {
    /* no restaurant/plan row — fall back to feature-derived entitlements */
  }

  return {
    planName,
    limits: access.onTrial ? {} : planLimits, // trial: no caps; else the plan's limits
    modules,
    status,
  };
}

/** True if the restaurant's plan unlocks a module (used by F/G/H gating). */
export async function hasModule(
  restaurantId: string,
  module: PlanModuleType,
): Promise<boolean> {
  const ent = await getEntitlements(restaurantId);
  return ent.modules.has(module);
}

/**
 * Throws PLAN_LIMIT if adding one more of `key` would exceed the plan. A missing
 * limit means unlimited. `currentCount` is the existing count of that resource.
 */
export async function assertWithinLimit(
  restaurantId: string,
  key: keyof PlanLimits,
  currentCount: number,
): Promise<void> {
  const ent = await getEntitlements(restaurantId);
  const max = ent.limits[key];
  if (typeof max === "number" && currentCount >= max) {
    throw new Error("PLAN_LIMIT");
  }
}
