import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { addMonths } from "@/lib/billing/period";
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

/**
 * Settle a monthly-feature payment from a gateway webhook: activate it and push
 * the period out a month. Returns false when the ref isn't one of these, so the
 * caller can fall through to add-ons / plan subscriptions. Idempotent.
 */
export async function activateFeatureSubByProviderRef(providerRef: string): Promise<boolean> {
  if (!providerRef) return false;
  try {
    return await systemDb(async (tx) => {
      const row = await tx.featureSubscription.findFirst({
        where: { providerRef },
        select: { id: true, currentPeriodEnd: true },
      });
      if (!row) return false;
      const now = new Date();
      // Extend from the existing period if it's still running, else from now.
      const base =
        row.currentPeriodEnd && row.currentPeriodEnd > now ? row.currentPeriodEnd : now;
      // Activation ONLY. Clearing the stale renewal link is housekeeping, and
      // bundling it in means a database missing that column refuses the whole
      // update — so somebody who has just paid doesn't get their feature.
      await tx.featureSubscription.update({
        where: { id: row.id },
        data: { status: "active", currentPeriodEnd: addMonths(base, 1) },
      });
      try {
        await tx.featureSubscription.update({
          where: { id: row.id },
          data: { renewUrl: null },
        });
      } catch {
        /* column not migrated — the stale link is harmless */
      }
      return true;
    });
  } catch {
    return false;
  }
}

/** Days before a period ends that we start trying to renew. */
const RENEW_WINDOW_DAYS = 3;

export interface FeatureRenewalSummary {
  processed: number;
  renewed: number; // charged off-session and extended
  invoiced: number; // renewal checkout issued, awaiting payment
  lapsed: number; // period ran out unpaid → access off
}

/**
 * Renew per-feature monthly subscriptions. Runs inside the daily billing cron.
 *
 * Tries an off-session charge when the restaurant has a saved card; otherwise
 * (the usual case on Xendit, which has no off-session charging here) it issues
 * a hosted renewal invoice and stores its URL so the owner can pay in a click.
 * Access is only ever extended by a real payment — either this charge or the
 * webhook — so an unpaid feature simply lapses.
 */
export async function renewFeatureSubscriptions(now: Date = new Date()): Promise<FeatureRenewalSummary> {
  const s: FeatureRenewalSummary = { processed: 0, renewed: 0, invoiced: 0, lapsed: 0 };
  const dueBefore = new Date(now.getTime() + RENEW_WINDOW_DAYS * 86_400_000);

  let due: {
    id: string;
    restaurantId: string;
    feature: string;
    priceMonthly: number;
    currentPeriodEnd: Date | null;
    renewUrl: string | null;
  }[] = [];
  try {
    due = await systemDb((tx) =>
      tx.featureSubscription.findMany({
        where: { status: { in: ["active", "past_due"] }, currentPeriodEnd: { lte: dueBefore } },
        select: {
          id: true,
          restaurantId: true,
          feature: true,
          priceMonthly: true,
          currentPeriodEnd: true,
          renewUrl: true,
        },
      }),
    );
  } catch {
    return s; // table not migrated yet
  }
  s.processed = due.length;
  if (due.length === 0) return s;

  const { getBillingProvider } = await import("@/server/billing");
  const provider = await getBillingProvider();

  for (const sub of due) {
    const lapsed = !!sub.currentPeriodEnd && sub.currentPeriodEnd <= now;
    const meta = MONTHLY_FEATURES[sub.feature];
    const label = meta?.label ?? sub.feature;

    // Off-session charge, when the account has a card saved on its plan.
    const card = await systemDb((tx) =>
      tx.subscription.findFirst({
        where: { restaurantId: sub.restaurantId },
        orderBy: { createdAt: "desc" },
        select: { providerPaymentMethodId: true, providerCustomerId: true },
      }),
    ).catch(() => null);

    if (provider && card?.providerPaymentMethodId) {
      try {
        const res = await provider.chargeSavedCard({
          amount: sub.priceMonthly,
          description: `Servd ${label} — 1 month`,
          paymentMethodId: card.providerPaymentMethodId,
          customerId: card.providerCustomerId ?? undefined,
        });
        if (res.status === "paid") {
          const base = sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
          await systemDb((tx) =>
            tx.featureSubscription.update({
              where: { id: sub.id },
              // renewUrl deliberately left alone — see the note in
              // activateFeatureSubByProviderRef. A renewal that fails because of
              // a bookkeeping field is a customer losing access they paid for.
              data: { status: "active", currentPeriodEnd: addMonths(base, 1) },
            }),
          );
          s.renewed++;
          continue;
        }
      } catch {
        /* fall through to invoicing */
      }
    }

    // No saved card (or the charge didn't settle) → issue a payable renewal.
    if (provider && !sub.renewUrl) {
      try {
        const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
        const checkout = await provider.createInvoiceCheckout({
          amount: sub.priceMonthly,
          description: `Servd ${label} — 1 month`,
          referenceNumber: `sub-${sub.id.slice(0, 12)}`,
          successUrl: `${base}/admin/content?subscribed=1`,
        });
        await systemDb((tx) =>
          tx.featureSubscription.update({
            where: { id: sub.id },
            data: { providerRef: checkout.gatewayRef, renewUrl: checkout.checkoutUrl },
          }),
        );
        s.invoiced++;
      } catch {
        /* try again on the next run */
      }
    }

    // Period actually ran out and it's still unpaid → mark it, access is already off.
    if (lapsed) {
      await systemDb((tx) =>
        tx.featureSubscription.update({ where: { id: sub.id }, data: { status: "past_due" } }),
      ).catch(() => {});
      s.lapsed++;
    }
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
