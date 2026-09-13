import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { manilaDayKey } from "@/lib/time/manila";
import { perUnit, rate, type Maybe } from "@/lib/bizops/metrics";
import type { PortfolioRow } from "./portfolio";

/**
 * Phase 3: where the money came from, what it cost, and who did the work.
 *
 * The rule from the brief holds throughout — every figure is derived from a
 * record of something that happened, and anything without a source is null so
 * the screen prints an em dash. Cost per lead with no ad spend entered is not
 * ₱0; it is "you haven't told me what you spent".
 */

export interface Cac {
  spend: number | null; // centavos
  leads: Maybe;
  activations: Maybe;
  costPerLead: Maybe; // centavos
  costPerActivation: Maybe; // centavos
}

/** Ad spend against what it bought, over a window. */
export async function getCac(since: Date): Promise<Cac> {
  const out: Cac = {
    spend: null,
    leads: null,
    activations: null,
    costPerLead: null,
    costPerActivation: null,
  };
  try {
    const agg = await systemDb((tx) =>
      tx.adSpend.aggregate({ where: { spendDate: { gte: since } }, _sum: { amount: true } }),
    );
    // No rows at all means nothing was entered — that is unknown, not zero.
    out.spend = agg._sum.amount;
  } catch {
    /* ad_spend not migrated — stays null */
  }
  try {
    out.leads = await systemDb((tx) =>
      tx.restaurant.count({ where: { createdAt: { gte: since }, status: "preview" } }),
    );
  } catch {
    /* stays null */
  }
  try {
    out.activations = await systemDb((tx) =>
      tx.activationRequest.count({ where: { activatedAt: { gte: since } } }),
    );
  } catch {
    /* stays null */
  }
  if (out.spend != null) {
    out.costPerLead = perUnit(out.spend, out.leads ?? 0);
    out.costPerActivation = perUnit(out.spend, out.activations ?? 0);
  }
  return out;
}

export interface FunnelStep {
  label: string;
  count: Maybe;
  /** Conversion from the step above. Null at the top, and whenever it can't be computed. */
  fromPrevious: Maybe;
}

/**
 * The whole funnel, both tracks, in one column.
 *
 * The DIY funnel screen already breaks the self-serve path down by day and by
 * UTM; this is deliberately the coarse version that puts the manual track
 * beside it, so the question "which path is leaking" has one answer rather than
 * two screens to compare by eye.
 */
export async function getFullFunnel(since: Date): Promise<FunnelStep[]> {
  const counts: Record<string, Maybe> = {
    outreach: null,
    previews: null,
    withMenu: null,
    requested: null,
    activated: null,
  };
  try {
    // Backfilled rows are excluded on purpose. The backfill gave each one the
    // restaurant's real createdAt, so a self-serve signup from last week is now
    // also a crm_clients row dated last week — counting it here would report
    // every DIY signup as an outreach prospect somebody went out and found.
    counts.outreach = await systemDb((tx) =>
      tx.crmClient.count({ where: { createdAt: { gte: since }, source: { not: "backfill" } } }),
    );
  } catch {
    /* null */
  }
  try {
    counts.previews = await systemDb((tx) =>
      tx.restaurant.count({ where: { createdAt: { gte: since } } }),
    );
  } catch {
    /* null */
  }
  try {
    counts.withMenu = await systemDb((tx) =>
      tx.restaurant.count({
        where: { createdAt: { gte: since }, menuItems: { some: {} } },
      }),
    );
  } catch {
    /* null */
  }
  try {
    counts.requested = await systemDb((tx) =>
      tx.activationRequest.count({ where: { createdAt: { gte: since } } }),
    );
  } catch {
    /* null */
  }
  try {
    counts.activated = await systemDb((tx) =>
      tx.activationRequest.count({ where: { activatedAt: { gte: since } } }),
    );
  } catch {
    /* null */
  }

  const steps: { label: string; count: Maybe }[] = [
    { label: "Outreach prospects added", count: counts.outreach },
    { label: "Accounts started", count: counts.previews },
    { label: "Built a menu", count: counts.withMenu },
    { label: "Asked to activate", count: counts.requested },
    { label: "Went live", count: counts.activated },
  ];

  return steps.map((s, i) => {
    // The first two aren't a sequence — an outreach prospect and a self-serve
    // signup are different people. Conversion starts where one step really does
    // lead to the next.
    const prev = i >= 2 ? steps[i - 1].count : null;
    return {
      ...s,
      fromPrevious: prev == null || s.count == null ? null : rate(s.count, prev),
    };
  });
}

export interface CohortRow {
  /** "2026-08" */
  month: string;
  customers: number;
  revenue: number; // centavos, everything that cohort has ever paid
  perCustomer: Maybe;
}

/**
 * Lifetime value by joining month.
 *
 * Built from the portfolio rather than its own queries, so the LTV on this
 * screen is the same money as the lifetime figure on a customer's profile. Two
 * views of revenue that disagree is worse than one view.
 */
export function getCohorts(portfolio: PortfolioRow[]): CohortRow[] {
  const byMonth = new Map<string, { customers: number; revenue: number }>();
  for (const r of portfolio) {
    if (r.status === "preview") continue; // never paid, never a cohort member
    const month = manilaDayKey(new Date(r.createdAt)).slice(0, 7);
    const cell = byMonth.get(month) ?? { customers: 0, revenue: 0 };
    cell.customers += 1;
    cell.revenue += r.lifetimeValue;
    byMonth.set(month, cell);
  }
  return [...byMonth.entries()]
    .map(([month, c]) => ({
      month,
      customers: c.customers,
      revenue: c.revenue,
      perCustomer: perUnit(c.revenue, c.customers),
    }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

export interface WorkerRow {
  actor: string;
  followUps: number;
  lastAt: string;
}

/**
 * Who has been doing the chasing.
 *
 * Counted from the events this layer writes, which is the only honest source:
 * `assignedTo` exists on the CRM row but nothing sets it yet, so a table built
 * on it would show every VA at zero and read as "nobody did anything".
 */
export async function getWorkerActivity(since: Date): Promise<WorkerRow[]> {
  try {
    const rows = await systemDb((tx) =>
      tx.customerEvent.findMany({
        where: { eventType: "note", occurredAt: { gte: since }, actor: { not: null } },
        orderBy: { occurredAt: "desc" },
        select: { actor: true, occurredAt: true, meta: true },
      }),
    );
    const by = new Map<string, { followUps: number; lastAt: Date }>();
    for (const r of rows) {
      const meta = r.meta as { kind?: string } | null;
      if (meta?.kind !== "follow_up_sent" || !r.actor) continue;
      const cell = by.get(r.actor);
      if (cell) cell.followUps += 1;
      else by.set(r.actor, { followUps: 1, lastAt: r.occurredAt });
    }
    return [...by.entries()]
      .map(([actor, v]) => ({
        actor,
        followUps: v.followUps,
        lastAt: v.lastAt.toISOString(),
      }))
      .sort((a, b) => b.followUps - a.followUps);
  } catch {
    return [];
  }
}
