import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { resolveBannerPlan } from "@/server/billing/plan-status";
import { getOrderCapEnabled } from "@/server/billing/platform-settings";
import { capFor } from "@/lib/billing/planLimits";

/** Free tier's monthly online-ordering-website order allowance. */
export const FREE_WEB_ORDER_CAP = capFor("starter");

export interface WebOrderCapStatus {
  capped: boolean; // true = this restaurant is subject to a monthly cap
  cap: number; // the monthly cap
  used: number; // web orders placed this calendar month
  remaining: number; // max(0, cap − used)
  reached: boolean; // used >= cap (block new web orders)
}

function monthStartUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Capped orders placed this month — QR dine-in + online website, counted
 * together (source "qr" or "web"). Best-effort; 0 if the column lags.
 */
export async function cappedOrdersThisMonth(restaurantId: string): Promise<number> {
  try {
    return await systemDb((tx) =>
      tx.order.count({ where: { restaurantId, source: { in: ["qr", "web"] }, createdAt: { gte: monthStartUtc() } } }),
    );
  } catch {
    return 0; // `source` column not migrated yet → don't block
  }
}

/**
 * The monthly order cap resolved from the restaurant's plan (starter=100,
 * lite=300, everything else unlimited). The GLOBAL master switch must be on;
 * while it's off, everyone is uncapped. Returns current usage and whether the
 * cap has been reached.
 */
export async function getWebOrderCapStatus(restaurantId: string): Promise<WebOrderCapStatus> {
  // Master switch off → nobody is capped (unlimited for all).
  if (!(await getOrderCapEnabled())) {
    return { capped: false, cap: Infinity, used: 0, remaining: Infinity, reached: false };
  }
  const { plan } = await resolveBannerPlan(restaurantId);
  const cap = capFor(plan ?? "starter");
  // Unlimited plans (Infinity) are never capped.
  if (!Number.isFinite(cap)) {
    return { capped: false, cap, used: 0, remaining: cap, reached: false };
  }
  const used = await cappedOrdersThisMonth(restaurantId);
  return { capped: true, cap, used, remaining: Math.max(0, cap - used), reached: used >= cap };
}
