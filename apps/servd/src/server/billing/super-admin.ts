import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import {
  asTier,
  defaultFeaturesForTier,
  sanitizeFeatures,
  type Feature,
} from "@/lib/billing/features";

export interface BusinessRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  businessAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  ownerLogin: string | null; // username (preferred) or email of the admin
  createdAt: Date;
}

/** All businesses for the super-admin, newest first (location + owner login). */
export async function listBusinesses(limit = 100): Promise<BusinessRow[]> {
  try {
    const rows = await systemDb((tx) =>
      tx.restaurant.findMany({
        // DIY previews live on the funnel page, not here — this list is real
        // businesses, and unactivated builds would swamp it.
        where: { status: { notIn: ["preview", "archived"] } },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          name: true,
          displayName: true,
          slug: true,
          status: true,
          businessAddress: true,
          latitude: true,
          longitude: true,
          createdAt: true,
          staff: {
            where: { role: "admin" },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { username: true, email: true },
          },
        },
      }),
    );
    return rows.map((r) => {
      const owner = r.staff[0];
      return {
        id: r.id,
        name: r.displayName || r.name,
        slug: r.slug,
        status: r.status,
        businessAddress: r.businessAddress,
        latitude: r.latitude,
        longitude: r.longitude,
        ownerLogin: owner ? owner.username || owner.email : null,
        createdAt: r.createdAt,
      };
    });
  } catch {
    return []; // columns not migrated yet
  }
}

/**
 * Cross-tenant subscription data for the platform back office. Everything runs
 * through systemDb (bypasses tenant RLS) because the super-admin owns the whole
 * platform — there is no single tenant to scope to.
 */

export type SubStatus = "trialing" | "active" | "past_due" | "cancelled";

export interface SubscriptionRow {
  restaurantId: string;
  restaurantName: string;
  slug: string;
  restaurantStatus: string;
  createdAt: string;
  subscriptionId: string | null;
  planId: string | null;
  planName: string | null;
  priceMonthly: number; // centavos
  status: SubStatus | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  failedCharges: number;
  hasSavedCard: boolean;
  smsCreditBalance: number;
  smsSenderName: string | null;
  ownerEmail: string | null; // owner's login email (synthetic for username logins)
  ownerUsername: string | null; // login handle, if username-based
  ownerPhone: string | null; // business contact phone (from signup / receipt)
}

/** The @ synthetic-login domain — an owner's "email" on that domain isn't real. */
const SYNTHETIC_LOGIN_DOMAIN = process.env.INTERNAL_LOGIN_DOMAIN || "staff.servdph.com";

/** Every restaurant with its current (latest) subscription + plan. */
export async function listSubscriptions(): Promise<SubscriptionRow[]> {
  const restaurants = await systemDb((tx) =>
    tx.restaurant.findMany({
      // Unactivated DIY previews have no subscription to show — see the funnel.
      where: { status: { notIn: ["preview", "archived"] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        smsCreditBalance: true,
        smsSenderName: true,
        printerConfig: true,
        staff: {
          where: { role: "admin" },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { email: true, username: true },
        },
        subscriptions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            planId: true,
            status: true,
            trialEndsAt: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            failedCharges: true,
            providerPaymentMethodId: true,
            plan: { select: { name: true, priceMonthly: true } },
          },
        },
      },
    }),
  );

  return restaurants.map((r) => {
    const sub = r.subscriptions[0];
    const owner = r.staff[0];
    // Synthetic-domain emails are username placeholders, not a real inbox.
    const realEmail = owner?.email && !owner.email.endsWith(`@${SYNTHETIC_LOGIN_DOMAIN}`) ? owner.email : null;
    const phone = (r.printerConfig as { receipt?: { phone?: string } } | null)?.receipt?.phone ?? null;
    return {
      ownerEmail: realEmail,
      ownerUsername: owner?.username ?? null,
      ownerPhone: phone,
      restaurantId: r.id,
      restaurantName: r.name,
      slug: r.slug,
      restaurantStatus: r.status,
      createdAt: r.createdAt.toISOString(),
      subscriptionId: sub?.id ?? null,
      planId: sub?.planId ?? null,
      planName: sub?.plan.name ?? null,
      priceMonthly: sub?.plan.priceMonthly ?? 0,
      status: (sub?.status ?? null) as SubStatus | null,
      trialEndsAt: sub?.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
      failedCharges: sub?.failedCharges ?? 0,
      hasSavedCard: !!sub?.providerPaymentMethodId,
      smsCreditBalance: r.smsCreditBalance,
      smsSenderName: r.smsSenderName,
    };
  });
}

export interface CustomerHealth {
  gmvMtd: number; // centavos collected this calendar month (paid payments)
  ordersMtd: number; // orders this calendar month (non-cancelled)
  orders30: number; // orders in the last 30 days
  ordersPrev30: number; // orders in the 30 days before that (for the trend)
  lastOrderAt: string | null; // ISO of the most recent order, ever
  onlineMtd: number; // online-website orders this month
  ratingAvg: number | null; // all-time avg star rating
  ratingCount: number;
}

/**
 * Per-restaurant health metrics for the super-admin subscriptions view —
 * computed with a handful of grouped queries (no N+1). systemDb bypasses RLS
 * because the platform owner sees every tenant.
 */
export async function listCustomerHealth(): Promise<Map<string, CustomerHealth>> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const d30 = new Date(now.getTime() - 30 * 86_400_000);
  const d60 = new Date(now.getTime() - 60 * 86_400_000);
  const map = new Map<string, CustomerHealth>();
  const ensure = (rid: string): CustomerHealth => {
    let h = map.get(rid);
    if (!h) {
      h = { gmvMtd: 0, ordersMtd: 0, orders30: 0, ordersPrev30: 0, lastOrderAt: null, onlineMtd: 0, ratingAvg: null, ratingCount: 0 };
      map.set(rid, h);
    }
    return h;
  };

  return systemDb(async (tx) => {
    // GMV this month (paid payments → grouped by the order's restaurant).
    const payments = await tx.payment.findMany({
      where: { status: "paid", createdAt: { gte: monthStart } },
      select: { amount: true, order: { select: { restaurantId: true } } },
    });
    for (const p of payments) if (p.order) ensure(p.order.restaurantId).gmvMtd += p.amount;

    const notCancelled = { status: { not: "cancelled" as const } };
    const [mtd, o30, oPrev30, last] = await Promise.all([
      tx.order.groupBy({ by: ["restaurantId"], where: { ...notCancelled, createdAt: { gte: monthStart } }, _count: { _all: true } }),
      tx.order.groupBy({ by: ["restaurantId"], where: { ...notCancelled, createdAt: { gte: d30 } }, _count: { _all: true } }),
      tx.order.groupBy({ by: ["restaurantId"], where: { ...notCancelled, createdAt: { gte: d60, lt: d30 } }, _count: { _all: true } }),
      tx.order.groupBy({ by: ["restaurantId"], _max: { createdAt: true } }),
    ]);
    for (const r of mtd) ensure(r.restaurantId).ordersMtd = r._count._all;
    for (const r of o30) ensure(r.restaurantId).orders30 = r._count._all;
    for (const r of oPrev30) ensure(r.restaurantId).ordersPrev30 = r._count._all;
    for (const r of last) ensure(r.restaurantId).lastOrderAt = r._max.createdAt ? r._max.createdAt.toISOString() : null;

    // Online orders this month (best-effort — the `source` column may lag).
    try {
      const web = await tx.order.groupBy({ by: ["restaurantId"], where: { source: "web", createdAt: { gte: monthStart } }, _count: { _all: true } });
      for (const r of web) ensure(r.restaurantId).onlineMtd = r._count._all;
    } catch { /* source not migrated yet */ }

    // All-time rating.
    try {
      const fb = await tx.feedback.groupBy({ by: ["restaurantId"], _avg: { rating: true }, _count: { _all: true } });
      for (const r of fb) { const h = ensure(r.restaurantId); h.ratingAvg = r._avg.rating != null ? Number(r._avg.rating) : null; h.ratingCount = r._count._all; }
    } catch { /* feedback table absent */ }

    return map;
  });
}

export interface SubscriptionMetrics {
  mrr: number; // centavos — active subs only
  mrrWithTrials: number; // centavos — active + trialing
  arr: number; // centavos — mrr × 12
  total: number;
  active: number;
  trialing: number;
  pastDue: number;
  cancelled: number;
  suspended: number;
  trialsEndingSoon: number; // within 7 days
}

/** Headline subscription metrics for the overview dashboard. */
export async function getSubscriptionMetrics(): Promise<SubscriptionMetrics> {
  const rows = await listSubscriptions();
  const now = Date.now();
  const soon = now + 7 * 24 * 60 * 60 * 1000;

  const m: SubscriptionMetrics = {
    mrr: 0,
    mrrWithTrials: 0,
    arr: 0,
    total: rows.length,
    active: 0,
    trialing: 0,
    pastDue: 0,
    cancelled: 0,
    suspended: 0,
    trialsEndingSoon: 0,
  };

  for (const r of rows) {
    if (r.restaurantStatus === "suspended") m.suspended++;
    switch (r.status) {
      case "active":
        m.active++;
        m.mrr += r.priceMonthly;
        m.mrrWithTrials += r.priceMonthly;
        break;
      case "trialing":
        m.trialing++;
        m.mrrWithTrials += r.priceMonthly;
        if (r.trialEndsAt && new Date(r.trialEndsAt).getTime() <= soon) m.trialsEndingSoon++;
        break;
      case "past_due":
        m.pastDue++;
        break;
      case "cancelled":
        m.cancelled++;
        break;
    }
  }
  m.arr = m.mrr * 12;
  return m;
}

export interface PlanRow {
  id: string;
  name: string;
  priceMonthly: number;
  trialDays: number;
  isActive: boolean;
  limits: { maxTables?: number; maxStaff?: number; smsIncluded?: number };
  modules: string[];
  features: Feature[]; // gateable features this plan grants
  subscriberCount: number;
}

const PLAN_SELECT = {
  id: true,
  name: true,
  priceMonthly: true,
  trialDays: true,
  isActive: true,
  limits: true,
  modules: { where: { enabled: true }, select: { module: true } },
  _count: { select: { subscriptions: true } },
} as const;

/** All plans (active + inactive) with subscriber counts, for the plans page. */
export async function listAllPlans(): Promise<PlanRow[]> {
  // Try with the per-plan features column; fall back to tier defaults if the
  // migration hasn't run yet so the plans page keeps working.
  try {
    const plans = await systemDb((tx) =>
      tx.plan.findMany({
        orderBy: { priceMonthly: "asc" },
        select: { ...PLAN_SELECT, features: true },
      }),
    );
    return plans.map((p) => ({
      id: p.id,
      name: p.name,
      priceMonthly: p.priceMonthly,
      trialDays: p.trialDays,
      isActive: p.isActive,
      limits: (p.limits as PlanRow["limits"] | null) ?? {},
      modules: p.modules.map((m) => m.module),
      features: sanitizeFeatures(p.features ?? []),
      subscriberCount: p._count.subscriptions,
    }));
  } catch {
    const plans = await systemDb((tx) =>
      tx.plan.findMany({ orderBy: { priceMonthly: "asc" }, select: PLAN_SELECT }),
    );
    return plans.map((p) => ({
      id: p.id,
      name: p.name,
      priceMonthly: p.priceMonthly,
      trialDays: p.trialDays,
      isActive: p.isActive,
      limits: (p.limits as PlanRow["limits"] | null) ?? {},
      modules: p.modules.map((m) => m.module),
      features: defaultFeaturesForTier(asTier(p.name)),
      subscriberCount: p._count.subscriptions,
    }));
  }
}

export interface InvoiceRow {
  id: string;
  restaurantName: string;
  amount: number;
  status: string;
  periodStart: string;
  periodEnd: string;
  paidAt: string | null;
  createdAt: string;
}

/** Recent platform invoices across all tenants. */
export async function listInvoices(limit = 200): Promise<InvoiceRow[]> {
  const invoices = await systemDb((tx) =>
    tx.restaurantInvoice.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        amount: true,
        status: true,
        periodStart: true,
        periodEnd: true,
        paidAt: true,
        createdAt: true,
        restaurant: { select: { name: true } },
      },
    }),
  );
  return invoices.map((i) => ({
    id: i.id,
    restaurantName: i.restaurant.name,
    amount: i.amount,
    status: i.status,
    periodStart: i.periodStart.toISOString(),
    periodEnd: i.periodEnd.toISOString(),
    paidAt: i.paidAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
  }));
}

/**
 * Restaurant ids that hold a settled custom-domain unlock. Used by the
 * subscriptions page to show (and toggle) who's already paid for it.
 * Best-effort: an un-migrated table just yields an empty set.
 */
export async function listCustomDomainUnlocks(): Promise<Set<string>> {
  try {
    const rows = await systemDb((tx) =>
      tx.addonPurchase.findMany({
        where: { addon: "custom_domain", status: "paid" },
        select: { restaurantId: true },
      }),
    );
    return new Set(rows.map((r) => r.restaurantId));
  } catch {
    return new Set();
  }
}

/**
 * Which accounts currently have each monthly-billed feature switched on.
 *
 * Read straight from the subscription rows rather than through the per-account
 * entitlement resolver: this renders one row per subscriber, and asking the
 * resolver per account would be a query per row for a fact one query answers.
 */
export async function listActiveMonthlyFeatures(): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  try {
    const rows = await systemDb((tx) =>
      tx.featureSubscription.findMany({
        where: { status: "active" },
        select: { restaurantId: true, feature: true, currentPeriodEnd: true },
      }),
    );
    const now = new Date();
    for (const r of rows) {
      // An "active" row whose period has run out isn't access — the renewal
      // cron just hasn't got to it yet.
      if (r.currentPeriodEnd && r.currentPeriodEnd <= now) continue;
      const set = map.get(r.restaurantId) ?? new Set<string>();
      set.add(r.feature);
      map.set(r.restaurantId, set);
    }
  } catch {
    /* table not migrated yet */
  }
  return map;
}

/**
 * Which accounts have unlimited table QRs, and how they got them.
 *
 * Two lookups rather than one because the two routes mean different things —
 * a grandfather flag is a promise kept, a settled purchase is revenue. The
 * super-admin row shows which, so "how many people actually paid for this" has
 * an answer.
 */
export async function listQrAccess(): Promise<{
  grandfathered: Set<string>;
  unlocked: Set<string>;
}> {
  const grandfathered = new Set<string>();
  const unlocked = new Set<string>();
  try {
    const rows = await systemDb((tx) =>
      tx.restaurant.findMany({ where: { qrGrandfathered: true }, select: { id: true } }),
    );
    for (const r of rows) grandfathered.add(r.id);
  } catch {
    /* column not migrated yet */
  }
  try {
    const rows = await systemDb((tx) =>
      tx.addonPurchase.findMany({
        where: { addon: "unlimitedTables", status: "paid" },
        select: { restaurantId: true },
      }),
    );
    for (const r of rows) unlocked.add(r.restaurantId);
  } catch {
    /* table not migrated yet */
  }
  return { grandfathered, unlocked };
}
