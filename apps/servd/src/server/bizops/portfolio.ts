import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { capFor } from "@/lib/billing/planLimits";
import { getOrderCapEnabled } from "@/server/billing/platform-settings";
import { manilaStartOfDay } from "@/lib/time/manila";
import { capBand, type CapBand } from "@/lib/bizops/metrics";
import { segmentOf, upsellsFor, type Segment, type UpsellRule } from "@/lib/bizops/segments";

/**
 * Every restaurant, with enough about each to place it in a segment, judge it
 * against its cap, and say what to offer it.
 *
 * Built as FOUR aggregate queries rather than a per-restaurant loop. The
 * obvious implementation — call getPlanBannerData for each shop — is one round
 * trip per restaurant, which is fine at ten and a timeout at three hundred.
 * The cap rule itself is still the shared `capFor`, imported rather than
 * copied, so this screen and the owner's own banner can never disagree about
 * whether somebody is capped.
 */

export interface PortfolioRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  plan: string;
  ordersThisMonth: number;
  monthValue: number;
  cap: number | null;
  band: CapBand;
  segment: Segment;
  lastOrderAt: string | null;
  menuItems: number;
  hasCustomDomain: boolean;
  hasInventory: boolean;
  upsells: UpsellRule[];
  /** Everything they have ever paid, centavos. */
  lifetimeValue: number;
}

function monthStart(now = new Date()): Date {
  const d = manilaStartOfDay(now);
  // Manila midnight on the 1st: step back to the first of this Manila month.
  const manila = new Date(d.getTime() + 8 * 3_600_000);
  manila.setUTCDate(1);
  return new Date(manila.getTime() - 8 * 3_600_000);
}

export async function getPortfolio(now = new Date()): Promise<PortfolioRow[] | null> {
  try {
    const since = monthStart(now);
    const capEnabled = await getOrderCapEnabled().catch(() => true);

    const restaurants = await systemDb((tx) =>
      tx.restaurant.findMany({
        where: { status: { in: ["active", "preview", "suspended"] } },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: {
          id: true,
          name: true,
          displayName: true,
          slug: true,
          status: true,
          createdAt: true,
          customDomain: true,
          _count: { select: { menuItems: true } },
        },
      }),
    );
    const ids = restaurants.map((r) => r.id);
    if (ids.length === 0) return [];

    // Orders this month, one grouped query for the whole portfolio.
    const orderAgg = await systemDb((tx) =>
      tx.order.groupBy({
        by: ["restaurantId"],
        where: { restaurantId: { in: ids }, createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { total: true },
      }),
    ).catch(() => []);
    const orders = new Map(
      orderAgg.map((o) => [o.restaurantId, { count: o._count._all, value: o._sum.total ?? 0 }]),
    );

    // The most recent order per shop, for the dormant rule.
    const lastOrders = await systemDb((tx) =>
      tx.order.groupBy({
        by: ["restaurantId"],
        where: { restaurantId: { in: ids } },
        _max: { createdAt: true },
      }),
    ).catch(() => []);
    const lastOrder = new Map(lastOrders.map((o) => [o.restaurantId, o._max.createdAt]));

    // Plan name per shop, for the cap. Read from the subscription's plan, which
    // is where the owner's own banner reads it from.
    const subs = await systemDb((tx) =>
      tx.subscription.findMany({
        where: { restaurantId: { in: ids } },
        orderBy: { createdAt: "desc" },
        select: { restaurantId: true, plan: { select: { name: true } } },
      }),
    ).catch(() => []);
    const planName = new Map<string, string>();
    for (const s of subs) if (!planName.has(s.restaurantId)) planName.set(s.restaurantId, s.plan?.name ?? "");

    // Everything ever paid, and what they own.
    const [paidActivations, paidAddons] = await Promise.all([
      systemDb((tx) =>
        tx.activationRequest.groupBy({
          by: ["restaurantId"],
          where: { restaurantId: { in: ids }, paidAt: { not: null } },
          _sum: { amount: true },
        }),
      ).catch(() => []),
      systemDb((tx) =>
        tx.addonPurchase.findMany({
          where: { restaurantId: { in: ids }, status: "paid" },
          select: { restaurantId: true, addon: true, amount: true },
        }),
      ).catch(() => []),
    ]);
    const activationValue = new Map(paidActivations.map((a) => [a.restaurantId, a._sum.amount ?? 0]));
    const addonValue = new Map<string, number>();
    const owned = new Map<string, Set<string>>();
    for (const a of paidAddons) {
      addonValue.set(a.restaurantId, (addonValue.get(a.restaurantId) ?? 0) + a.amount);
      const set = owned.get(a.restaurantId) ?? new Set<string>();
      set.add(a.addon);
      owned.set(a.restaurantId, set);
    }

    return restaurants.map((r) => {
      const plan = resolvePlan(planName.get(r.id) ?? "");
      const rawCap = capFor(plan);
      const cap = capEnabled && Number.isFinite(rawCap) ? rawCap : null;
      const o = orders.get(r.id) ?? { count: 0, value: 0 };
      const band = capBand(o.count, cap);
      const has = owned.get(r.id) ?? new Set<string>();
      const hasCustomDomain = !!r.customDomain || has.has("custom_domain");
      const hasInventory = has.has("inventory");
      const last = lastOrder.get(r.id) ?? null;

      return {
        id: r.id,
        name: r.displayName || r.name,
        slug: r.slug,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        plan,
        ordersThisMonth: o.count,
        monthValue: o.value,
        cap,
        band,
        segment: segmentOf(
          {
            status: r.status,
            createdAt: r.createdAt,
            ordersThisMonth: o.count,
            cap,
            lastOrderAt: last,
          },
          now,
        ),
        lastOrderAt: last ? last.toISOString() : null,
        menuItems: r._count.menuItems,
        hasCustomDomain,
        hasInventory,
        upsells: upsellsFor({
          band,
          ordersThisMonth: o.count,
          hasCustomDomain,
          hasInventory,
          menuItems: r._count.menuItems,
        }),
        lifetimeValue: (activationValue.get(r.id) ?? 0) + (addonValue.get(r.id) ?? 0),
      };
    });
  } catch {
    return null; // the screen says so rather than showing an empty portfolio
  }
}

/**
 * Plan name → the key `capFor` understands.
 *
 * Mirrors resolveBannerPlan in server/billing/plan-status.ts, minus the trial
 * lookup, which would be a query per restaurant. A trialing shop is uncapped
 * and shows here as its underlying plan — it will read as stricter than it is,
 * which is the safe direction: it can surface a shop as near its cap that
 * isn't, never hide one that is.
 */
function resolvePlan(name: string): string {
  if (!name) return "starter";
  if (/lite/i.test(name)) return "lite";
  if (/growth|business/i.test(name)) return "growth";
  return "starter";
}
