import "server-only";
import {
  computeStatement,
  monthKeyOf,
  recentMonths,
  type MonthKey,
  type Statement,
} from "@servd/db";
import { PRODUCTS } from "@servd/core";
import { partnerDb, systemDb } from "@/server/tenancy/scoped-db";

/**
 * Revenue, read through the partner's own scope.
 *
 * `partnerDb`, so the policy on `partner_ledger_entries` is what limits the
 * rows — a partner sees their own settlements and cannot read another's, and
 * that holds even if a where clause here is wrong.
 */
export interface RevenueOverview {
  current: Statement;
  months: Statement[];
}

export async function getRevenue(
  partnerId: string,
  asOf: Date = new Date(),
): Promise<RevenueOverview> {
  const keys = recentMonths(asOf, 6);
  const months = await partnerDb(partnerId, async (tx) => {
    const out: Statement[] = [];
    for (const m of keys) out.push(await computeStatement(tx, partnerId, m));
    return out;
  });
  return { current: months[months.length - 1], months: [...months].reverse() };
}

export async function getStatement(
  partnerId: string,
  month: MonthKey,
): Promise<Statement | null> {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  // Not a future month: a statement for next March is an empty document that
  // looks like a real one.
  if (month > monthKeyOf(new Date())) return null;
  return partnerDb(partnerId, (tx) => computeStatement(tx, partnerId, month));
}

export function productName(id: string): string {
  return (PRODUCTS as Record<string, { name: string }>)[id]?.name ?? id;
}

/** CSV of one statement's lines. Escaped, because a merchant name can hold a comma. */
export function statementCsv(s: Statement): string {
  const cell = (v: string | number) => {
    const str = String(v);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const head = [
    "settled_at",
    "product",
    "merchant_id",
    "kind",
    "gross_php",
    "partner_php",
    "hq_php",
    "share_pct",
  ];
  const rows = s.lines.map((l) =>
    [
      l.occurredAt.toISOString(),
      productName(l.productId),
      l.merchantId,
      l.kind,
      (l.grossCentavos / 100).toFixed(2),
      (l.partnerCentavos / 100).toFixed(2),
      (l.hqCentavos / 100).toFixed(2),
      l.sharePct,
    ].map(cell),
  );
  return [head.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export interface PlanPriceRow {
  planId: string;
  planName: string;
  /** What HQ lists the plan at, centavos. */
  catalogCentavos: number;
  /** The least a partner may charge. 0 = no floor. */
  floorCentavos: number;
  /** The partner's override, or null if they charge the catalogue price. */
  partnerCentavos: number | null;
  applyToExisting: boolean;
}

export async function listPlanPrices(partnerId: string): Promise<PlanPriceRow[]> {
  const plans = await systemDb((tx) =>
    tx.plan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: "asc" },
      select: { id: true, name: true, priceMonthly: true, priceFloor: true },
    }),
  );
  const overrides = await partnerDb(partnerId, (tx) =>
    tx.partnerPlanPrice.findMany({
      select: { planId: true, priceMonthly: true, applyToExisting: true },
    }),
  ).catch(() => []);

  const byPlan = new Map(overrides.map((o: { planId: string }) => [o.planId, o]));
  return plans.map((p) => {
    const o = byPlan.get(p.id) as
      | { priceMonthly: number; applyToExisting: boolean }
      | undefined;
    return {
      planId: p.id,
      planName: p.name,
      catalogCentavos: p.priceMonthly,
      floorCentavos: p.priceFloor,
      partnerCentavos: o?.priceMonthly ?? null,
      applyToExisting: o?.applyToExisting ?? false,
    };
  });
}

/**
 * Set a partner's price for one plan.
 *
 * The floor is enforced HERE and not only in the form, because a floor that
 * lives in a `min` attribute is a floor any POST ignores. HQ sets it for a
 * reason: CANVEXIA's share is a percentage of whatever was actually charged, so
 * one operator undercutting another comes out of HQ's revenue too.
 */
export async function setPlanPrice(
  actor: { partnerId: string; email: string },
  planId: string,
  priceCentavos: number,
  applyToExisting: boolean,
): Promise<{ ok: boolean; message?: string }> {
  const plan = await systemDb((tx) =>
    tx.plan.findUnique({
      where: { id: planId },
      select: { id: true, name: true, priceFloor: true },
    }),
  ).catch(() => null);
  if (!plan) return { ok: false, message: "That plan no longer exists." };

  if (!Number.isFinite(priceCentavos) || priceCentavos < 0) {
    return { ok: false, message: "Enter a price." };
  }
  if (plan.priceFloor > 0 && priceCentavos < plan.priceFloor) {
    return {
      ok: false,
      message: `The floor for ${plan.name} is ₱${Math.round(plan.priceFloor / 100).toLocaleString("en-PH")} a month.`,
    };
  }

  try {
    await partnerDb(actor.partnerId, async (tx) => {
      const before = await tx.partnerPlanPrice.findFirst({
        where: { planId },
        select: { priceMonthly: true },
      });
      await tx.partnerPlanPrice.upsert({
        where: { partnerId_planId: { partnerId: actor.partnerId, planId } },
        create: {
          partnerId: actor.partnerId,
          planId,
          priceMonthly: priceCentavos,
          applyToExisting,
        },
        update: { priceMonthly: priceCentavos, applyToExisting, updatedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorType: "partner",
          partnerId: actor.partnerId,
          actorEmail: actor.email,
          action: "pricing.set",
          entityType: "plan",
          entityId: planId,
          before: { priceMonthly: before?.priceMonthly ?? null },
          after: { priceMonthly: priceCentavos, applyToExisting },
        },
      });
    });
    return { ok: true };
  } catch {
    return { ok: false, message: "Could not save that price." };
  }
}
