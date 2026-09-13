import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { getPlanAccess } from "@/server/billing/feature-gate";
import { getOrderCapEnabled } from "@/server/billing/platform-settings";
import { capFor } from "@/lib/billing/planLimits";
import type { BannerPlan, PlanBannerData } from "@/lib/billing/planBanner";

const BANNER_PLANS = new Set(["trial", "starter", "lite", "growth", "legacy"]);

function monthStartUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Resolve a restaurant's banner plan from Servd's real state:
 *   - an explicit super-admin `bannerPlan` override wins (legacy / lite / …)
 *   - active trial            → "trial"
 *   - a plan named "Lite"     → "lite"   (hidden save offer)
 *   - Free tier               → "starter"
 *   - Growth / Business       → "growth" (unlimited)
 * Never invents "lite" from price — only an override or an assigned Lite plan.
 */
export async function resolveBannerPlan(
  restaurantId: string,
): Promise<{ plan: BannerPlan; trialEndsAt: string | null }> {
  let override: string | null = null;
  let trialEndsAt: string | null = null;
  let planName: string | null = null;
  try {
    const r = await systemDb((tx) =>
      tx.restaurant.findFirst({ where: { id: restaurantId }, select: { bannerPlan: true } }),
    );
    override = r?.bannerPlan ?? null;
  } catch {
    /* bannerPlan column not migrated yet */
  }
  try {
    const sub = await systemDb((tx) =>
      tx.subscription.findFirst({
        where: { restaurantId },
        orderBy: { createdAt: "desc" },
        select: { trialEndsAt: true, plan: { select: { name: true } } },
      }),
    );
    trialEndsAt = sub?.trialEndsAt?.toISOString() ?? null;
    planName = sub?.plan?.name ?? null;
  } catch {
    /* best-effort */
  }

  if (override && BANNER_PLANS.has(override)) {
    return { plan: override as BannerPlan, trialEndsAt };
  }

  const { tier, onTrial } = await getPlanAccess(restaurantId);
  if (onTrial) return { plan: "trial", trialEndsAt };
  if (planName && /lite/i.test(planName)) return { plan: "lite", trialEndsAt };
  if (tier === "Growth" || tier === "Business") return { plan: "growth", trialEndsAt };
  // Free tier, unknown, or no subscription → the capped starter experience.
  return { plan: "starter", trialEndsAt };
}

/** Everything the plan banner needs, computed from the restaurant's real state. */
export async function getPlanBannerData(restaurantId: string): Promise<PlanBannerData> {
  const { plan, trialEndsAt } = await resolveBannerPlan(restaurantId);
  const cap = capFor(plan ?? "starter");
  const capEnabled = await getOrderCapEnabled();

  let ordersThisMonth = 0;
  let monthValue = 0;
  try {
    // Capped orders = QR dine-in + online, counted together.
    const agg = await systemDb((tx) =>
      tx.order.aggregate({
        where: { restaurantId, source: { in: ["qr", "web"] }, createdAt: { gte: monthStartUtc() } },
        _count: true,
        _sum: { total: true },
      }),
    );
    ordersThisMonth = agg._count;
    monthValue = agg._sum.total ?? 0;
  } catch {
    /* `source` column not migrated yet → 0 (banner degrades gracefully) */
  }

  // With the master switch off, nobody is capped — no cap number, never paused.
  const finiteCap = capEnabled && Number.isFinite(cap) ? cap : null;
  const orderingPaused = finiteCap != null && ordersThisMonth >= finiteCap;

  return { plan, trialEndsAt, ordersThisMonth, monthValue, cap: finiteCap, orderingPaused, capEnabled };
}
