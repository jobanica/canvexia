import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { manilaStartOfDay, manilaStartOfDaysAgo } from "@/lib/time/manila";
import { BRANCH_NOTE } from "@/server/tenancy/branch-activation";
import type { Maybe } from "@/lib/bizops/metrics";

/**
 * The read side of the business dashboard.
 *
 * Every money figure comes from a row that represents a payment that actually
 * happened — a paid activation request, a paid addon purchase, an active
 * subscription with the price snapshotted at purchase. Nothing is recomputed
 * from an assumed price list, because the price list has changed twice and a
 * dashboard that multiplies customers by a remembered number is a dashboard
 * that is confidently wrong.
 *
 * Anything without a source returns null so the screen prints an em dash.
 */

export type Period = "today" | "week" | "month";

export function periodStart(period: Period, now = new Date()): Date {
  if (period === "today") return manilaStartOfDay(now);
  if (period === "week") return manilaStartOfDaysAgo(7, now);
  return manilaStartOfDaysAgo(30, now);
}

export interface RevenueBreakdown {
  /** ₱499 one-time activations of the ordering site. Centavos. */
  activations: number;
  activationCount: number;
  /** ₱499 per extra branch. Counted apart, because it's expansion, not acquisition. */
  branches: number;
  branchCount: number;
  /** One-time feature unlocks — domain, inventory, accounting, HR… */
  unlocks: number;
  unlockCount: number;
  total: number;
  /** Monthly recurring, from live subscriptions. Servd's only recurring line. */
  mrr: number;
  mrrCount: number;
}

/**
 * What was actually collected in the window, by kind.
 *
 * Activations and branch activations share a table and are told apart by the
 * note the branch checkout writes — so a shop opening its third branch doesn't
 * inflate "new customers acquired".
 */
export async function getRevenue(since: Date): Promise<RevenueBreakdown | null> {
  try {
    return await systemDb(async (tx) => {
      const paid = await tx.activationRequest.findMany({
        where: { paidAt: { gte: since } },
        select: { amount: true, note: true },
      });
      let activations = 0;
      let activationCount = 0;
      let branches = 0;
      let branchCount = 0;
      for (const r of paid) {
        if (r.note === BRANCH_NOTE) {
          branches += r.amount;
          branchCount += 1;
        } else {
          activations += r.amount;
          activationCount += 1;
        }
      }

      const addons = await tx.addonPurchase.findMany({
        where: { status: "paid", paidAt: { gte: since } },
        select: { amount: true },
      });
      const unlocks = addons.reduce((s, a) => s + a.amount, 0);

      // MRR is a snapshot, not a windowed sum: it's what renews next month.
      const subs = await tx.featureSubscription.findMany({
        where: { status: "active" },
        select: { priceMonthly: true },
      });

      return {
        activations,
        activationCount,
        branches,
        branchCount,
        unlocks,
        unlockCount: addons.length,
        total: activations + branches + unlocks,
        mrr: subs.reduce((s, x) => s + x.priceMonthly, 0),
        mrrCount: subs.length,
      };
    });
  } catch {
    return null; // a column lags → an em dash, never a zero
  }
}

export interface AcquisitionCounts {
  /** DIY previews started in the window. */
  diyStarted: Maybe;
  /** DIY previews that reached the point of asking to activate. */
  diyRequested: Maybe;
  /** Outreach prospects added to the CRM. */
  outreachAdded: Maybe;
  /** Restaurants that went live. */
  activated: Maybe;
}

/** Where customers came from in the window. Each count fails to null on its own. */
export async function getAcquisition(since: Date): Promise<AcquisitionCounts> {
  const out: AcquisitionCounts = {
    diyStarted: null,
    diyRequested: null,
    outreachAdded: null,
    activated: null,
  };
  try {
    out.diyStarted = await systemDb((tx) =>
      tx.restaurant.count({ where: { createdAt: { gte: since }, status: "preview" } }),
    );
  } catch {
    /* leave null */
  }
  try {
    out.diyRequested = await systemDb((tx) =>
      tx.activationRequest.count({ where: { createdAt: { gte: since } } }),
    );
  } catch {
    /* leave null */
  }
  try {
    // Excludes the backfill for the same reason as getFullFunnel: those rows
    // carry the restaurant's createdAt, so they'd land in this window and
    // report self-serve signups as prospects the team went and found.
    out.outreachAdded = await systemDb((tx) =>
      tx.crmClient.count({ where: { createdAt: { gte: since }, source: { not: "backfill" } } }),
    );
  } catch {
    /* leave null */
  }
  try {
    out.activated = await systemDb((tx) =>
      tx.activationRequest.count({ where: { activatedAt: { gte: since } } }),
    );
  } catch {
    /* leave null */
  }
  return out;
}

export interface TimelineEvent {
  id: string;
  eventType: string;
  actor: string | null;
  amount: number | null;
  meta: unknown;
  occurredAt: string;
}

/** One customer's event timeline, newest first. Empty on any failure. */
export async function getTimeline(
  restaurantId: string | null,
  leadId: string | null,
): Promise<TimelineEvent[]> {
  if (!restaurantId && !leadId) return [];
  try {
    const rows = await systemDb((tx) =>
      tx.customerEvent.findMany({
        where: {
          OR: [
            ...(restaurantId ? [{ restaurantId }] : []),
            ...(leadId ? [{ leadId }] : []),
          ],
        },
        orderBy: { occurredAt: "desc" },
        take: 200,
        select: {
          id: true,
          eventType: true,
          actor: true,
          amount: true,
          meta: true,
          occurredAt: true,
        },
      }),
    );
    return rows.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      actor: r.actor,
      amount: r.amount,
      meta: r.meta,
      occurredAt: r.occurredAt.toISOString(),
    }));
  } catch {
    return []; // table not migrated yet
  }
}
