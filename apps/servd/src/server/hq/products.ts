import "server-only";
import { PRODUCTS } from "@servd/core";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * Products, plans and flags, as HQ sees them.
 *
 * THE REGISTRY IS THE SOURCE OF TRUTH for which products exist and which can
 * actually take a merchant. `product_settings` overlays the editable fields.
 * The merge happens here rather than in a component so that "the code wins on
 * `live`" is one rule in one place: a row marked "live" for a product whose
 * adapter says `live: false` reads as coming soon, because the flag exists to
 * stop the portal offering an account in something that cannot create one.
 */

export interface ProductRow {
  id: string;
  name: string;
  description: string;
  /** From the registry. Whether a merchant can actually be provisioned. */
  provisionable: boolean;
  /** From the database. Presentation only. */
  status: "live" | "beta" | "coming";
  trainingUrl: string | null;
  demoAccountRef: string | null;
  defaultEnabled: boolean;
  /** Merchants on this product, across every partner. */
  merchants: number;
  flags: { id: string; key: string; enabled: boolean; partnerId: string | null; note: string | null }[];
}

export interface PlanRow {
  id: string;
  name: string;
  priceMonthly: number;
  priceFloor: number;
  trialDays: number;
  isActive: boolean;
  limits: unknown;
  /** Partners whose own price for this plan is BELOW the floor. */
  below: { partnerId: string; partnerName: string; priceMonthly: number }[];
  merchants: number;
}

export async function listProducts(): Promise<ProductRow[]> {
  return systemDb(async (tx) => {
    const [settings, flags, restaurants, pharmacies] = await Promise.all([
      tx.productSetting.findMany().catch(() => []),
      tx.featureFlag
        .findMany({
          orderBy: [{ productId: "asc" }, { key: "asc" }],
          select: { id: true, productId: true, key: true, enabled: true, partnerId: true, note: true },
        })
        .catch(() => []),
      tx.restaurant.count(),
      tx.pharmacy.count(),
    ]);

    const bySettings = new Map(settings.map((s) => [s.productId, s]));
    const counts: Record<string, number> = { servd: restaurants, pharmacy: pharmacies };

    return Object.values(PRODUCTS).map((p) => {
      const s = bySettings.get(p.id);
      // The code wins. A row saying "live" for a product the registry marks
      // live:false cannot make it provisionable, so it must not say so either.
      const stored = (s?.status ?? "coming") as ProductRow["status"];
      const status: ProductRow["status"] = p.live ? stored : stored === "live" ? "beta" : stored;

      return {
        id: p.id,
        name: p.name,
        description: p.description,
        provisionable: p.live,
        status,
        trainingUrl: s?.trainingUrl ?? null,
        demoAccountRef: s?.demoAccountRef ?? null,
        defaultEnabled: s?.defaultEnabled ?? false,
        merchants: counts[p.id] ?? 0,
        flags: flags.filter((f) => f.productId === p.id),
      };
    });
  });
}

export async function listPlans(): Promise<PlanRow[]> {
  return systemDb(async (tx) => {
    const [plans, overrides, partners, byPlan] = await Promise.all([
      tx.plan.findMany({
        orderBy: { priceMonthly: "asc" },
        select: {
          id: true,
          name: true,
          priceMonthly: true,
          priceFloor: true,
          trialDays: true,
          isActive: true,
          limits: true,
        },
      }),
      tx.partnerPlanPrice
        .findMany({ select: { partnerId: true, planId: true, priceMonthly: true } })
        .catch(() => []),
      tx.partner.findMany({ select: { id: true, name: true } }),
      tx.restaurant.groupBy({ by: ["planId"], _count: { _all: true } }).catch(() => []),
    ]);

    const nameBy = new Map(partners.map((p) => [p.id, p.name]));
    const countBy = new Map(byPlan.map((r) => [r.planId, r._count._all]));

    return plans.map((p) => ({
      ...p,
      merchants: countBy.get(p.id) ?? 0,
      // The list the brief asks for before a floor change is confirmed: who is
      // currently priced under it. Computed against the CURRENT floor here; the
      // action recomputes against the proposed one.
      below: overrides
        .filter((o) => o.planId === p.id && o.priceMonthly < p.priceFloor)
        .map((o) => ({
          partnerId: o.partnerId,
          partnerName: nameBy.get(o.partnerId) ?? "(unknown)",
          priceMonthly: o.priceMonthly,
        })),
    }));
  });
}

/**
 * Who would be under a PROPOSED floor.
 *
 * Separate from `listPlans` because the question is different: that one answers
 * "who is under the floor we have", this answers "who would this break". The
 * brief requires the second before a floor change is confirmed.
 */
export async function partnersBelowFloor(
  planId: string,
  proposedFloorCentavos: number,
): Promise<{ partnerId: string; partnerName: string; priceMonthly: number }[]> {
  return systemDb(async (tx) => {
    const [overrides, partners, plan] = await Promise.all([
      tx.partnerPlanPrice
        .findMany({ where: { planId }, select: { partnerId: true, priceMonthly: true } })
        .catch(() => []),
      tx.partner.findMany({ select: { id: true, name: true } }),
      tx.plan.findUnique({ where: { id: planId }, select: { priceMonthly: true } }),
    ]);
    const nameBy = new Map(partners.map((p) => [p.id, p.name]));

    const out = overrides
      .filter((o) => o.priceMonthly < proposedFloorCentavos)
      .map((o) => ({
        partnerId: o.partnerId,
        partnerName: nameBy.get(o.partnerId) ?? "(unknown)",
        priceMonthly: o.priceMonthly,
      }));

    // A partner with NO override charges the catalogue price. If that is itself
    // under the proposed floor, every one of those partners is affected too —
    // and listing only the overrides would have hidden the largest group.
    if (plan && plan.priceMonthly < proposedFloorCentavos) {
      const overriding = new Set(overrides.map((o) => o.partnerId));
      for (const p of partners) {
        if (!overriding.has(p.id)) {
          out.push({ partnerId: p.id, partnerName: p.name, priceMonthly: plan.priceMonthly });
        }
      }
    }

    return out.sort((a, b) => a.priceMonthly - b.priceMonthly);
  });
}
