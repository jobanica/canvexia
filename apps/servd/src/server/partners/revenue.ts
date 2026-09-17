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
import { writePartnerAudit } from "@/server/audit/log";

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
      await writePartnerAudit(tx, actor.partnerId, {
        actorEmail: actor.email,
        action: "pricing.set",
        entityType: "plan",
        entityId: planId,
        before: { priceMonthly: before?.priceMonthly ?? null },
        after: { priceMonthly: priceCentavos, applyToExisting },
      });
    });
    return { ok: true };
  } catch {
    return { ok: false, message: "Could not save that price." };
  }
}

export interface PayableRow {
  month: string;
  amountCentavos: number;
  merchantCount: number;
  dueAt: Date | null;
  status: string;
  paidAt: Date | null;
  note: string | null;
  /** Past its date and not settled. Derived, never stored — see below. */
  overdue: boolean;
}

/**
 * What this partner owes CANVEXIA, month by month.
 *
 * THE DIRECTION IS THE POINT. `PartnerStatement` was written in the commission
 * era, when Servd collected and paid partners out — `payoutStatus` still carries
 * that name. Under `collectionMode: "partner_collects"` the money flows the
 * other way: the partner collected from their merchants and owes HQ its share.
 * `hqCentavos` is therefore the PAYABLE, not a payout.
 *
 * `overdue` is derived from the date rather than read from `payoutStatus`,
 * because that column only ever changes when a human moves it. A statement that
 * quietly passed its date while nobody was looking is exactly the one a partner
 * needs to see marked late.
 */
export async function listPayables(partnerId: string, take = 12): Promise<PayableRow[]> {
  try {
    const rows = await partnerDb(partnerId, (tx) =>
      tx.partnerStatement.findMany({
        where: { partnerId },
        orderBy: { month: "desc" },
        take,
        select: {
          month: true,
          hqCentavos: true,
          merchantCount: true,
          dueAt: true,
          payoutStatus: true,
          paidAt: true,
          note: true,
        },
      }),
    );
    const now = Date.now();
    return rows.map((r) => ({
      month: r.month,
      amountCentavos: r.hqCentavos,
      merchantCount: r.merchantCount,
      dueAt: r.dueAt,
      status: r.payoutStatus,
      paidAt: r.paidAt,
      note: r.note,
      overdue:
        r.payoutStatus !== "paid" &&
        r.hqCentavos > 0 &&
        !!r.dueAt &&
        r.dueAt.getTime() < now,
    }));
  } catch {
    return [];
  }
}


/**
 * What has accrued THIS month and is not yet billed.
 *
 * THE GAP THIS FILLS: every confirmed renewal writes a `PartnerLedgerEntry`
 * immediately, but the Payables screen listed only FROZEN statements — and a
 * month is frozen after it ends. So a partner could confirm ₱999 this morning,
 * watch CANVEXIA's ₱299.70 land in the ledger, and see ₱0 owed, because
 * September does not exist as a statement until October.
 *
 * That is not a reporting nicety. A partner who believes they owe nothing all
 * month gets one bill on the first and seven days to find the money.
 *
 * Computed live from the ledger by the SAME function that freezes the month, so
 * the running total and the eventual statement cannot disagree — one of them
 * being a second implementation is exactly how they would.
 */
export async function currentMonthAccrual(
  partnerId: string,
): Promise<{ month: string; amountCentavos: number; merchantCount: number } | null> {
  try {
    const month = monthKeyOf(new Date());
    const s = await partnerDb(partnerId, (tx) => computeStatement(tx, partnerId, month));
    return { month, amountCentavos: s.hqCentavos, merchantCount: s.merchantCount };
  } catch {
    return null;
  }
}
