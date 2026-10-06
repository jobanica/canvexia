import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import type { Feature } from "@/lib/billing/features";

/**
 * Features sold as their OWN monthly subscription rather than with the plan or
 * as a one-time unlock. These are deliberately excluded from plan grants AND
 * from the trial's blanket unlock — the first month must be paid before the
 * feature opens, and access lapses when the paid period ends.
 */
export const MONTHLY_FEATURES: Record<string, { label: string; priceMonthly: number }> = {
  contentScheduler: { label: "Content scheduler", priceMonthly: 49_900 }, // ₱499/mo
};

export function isMonthlyFeature(feature: string): boolean {
  return feature in MONTHLY_FEATURES;
}

export interface FeatureSubStatus {
  active: boolean;
  status: string; // pending | active | past_due | cancelled | none
  currentPeriodEnd: Date | null;
  priceMonthly: number;
  /** A checkout was started but hasn't been paid yet. */
  pending: boolean;
  /** Hosted checkout for an issued renewal that's still unpaid. */
  renewUrl: string | null;
}

/** Where this restaurant stands on a monthly feature. */
export async function getFeatureSubscription(
  restaurantId: string,
  feature: string,
): Promise<FeatureSubStatus> {
  const price = MONTHLY_FEATURES[feature]?.priceMonthly ?? 0;
  const none: FeatureSubStatus = {
    active: false,
    status: "none",
    currentPeriodEnd: null,
    priceMonthly: price,
    pending: false,
    renewUrl: null,
  };
  try {
    // Columns listed explicitly. A bare findFirst asks for every column in the
    // Prisma model, so one column the database hasn't been given yet threw the
    // whole query — and this function's catch turned that into "no
    // subscription", i.e. a paid feature reading as locked. Naming them keeps a
    // lagging column to the one field that actually needs it.
    const row = await systemDb((tx) =>
      tx.featureSubscription.findFirst({
        where: { restaurantId, feature },
        select: { status: true, currentPeriodEnd: true, priceMonthly: true },
      }),
    );
    if (!row) return none;
    const live =
      row.status === "active" && !!row.currentPeriodEnd && row.currentPeriodEnd.getTime() > Date.now();

    // The renewal link is a newer column and only matters for a pending
    // renewal, so it's read on its own and allowed to come back empty.
    let renewUrl: string | null = null;
    try {
      const r = await systemDb((tx) =>
        tx.featureSubscription.findFirst({
          where: { restaurantId, feature },
          select: { renewUrl: true },
        }),
      );
      renewUrl = r?.renewUrl ?? null;
    } catch {
      /* column not migrated yet */
    }

    return {
      active: live,
      status: row.status,
      currentPeriodEnd: row.currentPeriodEnd,
      priceMonthly: row.priceMonthly || price,
      pending: row.status === "pending",
      renewUrl,
    };
  } catch {
    return none; // table not migrated yet → locked, nothing breaks
  }
}

/** Every monthly feature this restaurant currently has paid, live access to. */
export async function listActiveMonthlyFeatures(restaurantId: string): Promise<Set<Feature>> {
  try {
    const rows = await systemDb((tx) =>
      tx.featureSubscription.findMany({
        where: { restaurantId, status: "active", currentPeriodEnd: { gt: new Date() } },
        select: { feature: true },
      }),
    );
    return new Set(rows.map((r) => r.feature as Feature));
  } catch {
    return new Set<Feature>();
  }
}

export interface FeatureRenewalSummary {
  processed: number;
  lapsed: number; // period ran out → access off
}

/**
 * Lapse per-feature monthly subscriptions whose paid period has ended. Runs in
 * the daily billing cron.
 *
 * There is no renewal here any more: the gateway charge and the hosted renewal
 * invoice are retired (D38). A feature is extended by HQ after a confirmed
 * bank or QR payment; until then it simply runs out.
 */
export async function renewFeatureSubscriptions(now: Date = new Date()): Promise<FeatureRenewalSummary> {
  const s: FeatureRenewalSummary = { processed: 0, lapsed: 0 };
  try {
    const r = await systemDb((tx) =>
      tx.featureSubscription.updateMany({
        where: { status: "active", currentPeriodEnd: { lte: now } },
        data: { status: "past_due" },
      }),
    );
    s.processed = r.count;
    s.lapsed = r.count;
  } catch {
    /* table not migrated yet */
  }
  return s;
}

export interface MonthlyFeatureUsage {
  active: number; // paid and live — these consume an Upload-Post profile
  pending: number; // started checkout, not paid yet
  lapsed: number; // past_due / expired
  connected: number; // restaurants with an Upload-Post profile provisioned
}

/**
 * Platform-wide take-up of a monthly feature, for capacity planning (e.g. how
 * many Upload-Post profiles are actually in use). Super-admin only.
 */
export async function getMonthlyFeatureUsage(feature: string): Promise<MonthlyFeatureUsage> {
  const empty: MonthlyFeatureUsage = { active: 0, pending: 0, lapsed: 0, connected: 0 };
  try {
    return await systemDb(async (tx) => {
      const rows = await tx.featureSubscription.findMany({
        where: { feature },
        select: { status: true, currentPeriodEnd: true },
      });
      const now = Date.now();
      let active = 0;
      let pending = 0;
      let lapsed = 0;
      for (const r of rows) {
        const live = r.status === "active" && !!r.currentPeriodEnd && r.currentPeriodEnd.getTime() > now;
        if (live) active++;
        else if (r.status === "pending") pending++;
        else lapsed++;
      }
      // Profiles provisioned on Upload-Post — these exist even after a lapse,
      // so this is the number the subscription actually has to cover.
      const connected =
        feature === "contentScheduler"
          ? await tx.restaurant.count({ where: { uploadPostUser: { not: null } } })
          : 0;
      return { active, pending, lapsed, connected };
    });
  } catch {
    return empty; // table not migrated yet
  }
}
