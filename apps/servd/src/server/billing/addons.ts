import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { getPlanAccess } from "@/server/billing/feature-gate";

/** One-time price to unlock a custom domain on Free / during a trial (centavos). */
export const CUSTOM_DOMAIN_PRICE = 50_000; // ₱500.00

export const CUSTOM_DOMAIN_ADDON = "custom_domain";

export interface CustomDomainAccess {
  allowed: boolean;
  /** Included in the paid plan (Growth/Business, off-trial) — nothing to buy. */
  viaPlan: boolean;
  /** Bought as the one-time ₱500 unlock. */
  viaPurchase: boolean;
  /** A checkout was started but hasn't been paid yet. */
  pending: boolean;
}

/** True once this restaurant has a settled purchase for the add-on. */
async function hasPaidAddon(restaurantId: string, addon: string): Promise<boolean> {
  try {
    const row = await systemDb((tx) =>
      tx.addonPurchase.findFirst({ where: { restaurantId, addon, status: "paid" }, select: { id: true } }),
    );
    return !!row;
  } catch {
    return false; // table not migrated yet → treat as not purchased
  }
}

async function hasPendingAddon(restaurantId: string, addon: string): Promise<boolean> {
  try {
    const row = await systemDb((tx) =>
      tx.addonPurchase.findFirst({ where: { restaurantId, addon, status: "pending" }, select: { id: true } }),
    );
    return !!row;
  } catch {
    return false;
  }
}

/**
 * Who may use a custom domain.
 *
 * A PAID Growth/Business subscription includes it. Free accounts — and accounts
 * still on a trial, since a trial otherwise unlocks every feature — must buy
 * the one-time ₱500 unlock. Once bought it's theirs for good, whatever plan
 * they're on later.
 */
export async function getCustomDomainAccess(restaurantId: string): Promise<CustomDomainAccess> {
  const access = await getPlanAccess(restaurantId);
  // Deliberately ignores the trial's blanket feature unlock — the domain stays
  // locked until they either pay for a plan or buy the add-on.
  const viaPlan = !access.onTrial && access.features.has("customDomain");
  if (viaPlan) return { allowed: true, viaPlan: true, viaPurchase: false, pending: false };

  const viaPurchase = await hasPaidAddon(restaurantId, CUSTOM_DOMAIN_ADDON);
  const pending = viaPurchase ? false : await hasPendingAddon(restaurantId, CUSTOM_DOMAIN_ADDON);
  return { allowed: viaPurchase, viaPlan: false, viaPurchase, pending };
}

/**
 * Settle an add-on purchase from a gateway webhook. Returns false when the ref
 * isn't an add-on (so the caller can fall through to subscription activation).
 * Idempotent — a replayed webhook is a no-op.
 */
export async function markAddonPaidByProviderRef(providerRef: string): Promise<boolean> {
  if (!providerRef) return false;
  try {
    return await systemDb(async (tx) => {
      const row = await tx.addonPurchase.findFirst({ where: { providerRef } });
      if (!row) return false;
      if (row.status !== "paid") {
        await tx.addonPurchase.update({
          where: { id: row.id },
          data: { status: "paid", paidAt: new Date() },
        });
      }
      return true;
    });
  } catch {
    return false;
  }
}

// ------------------------------------------------------- table / QR unlock

export const UNLIMITED_TABLES_ADDON = "unlimitedTables";

export interface TableQrAccess {
  unlimited: boolean;
  /** Non-counter tables in use right now. */
  tableCount: number;
  /** How many more may be created (Infinity when unlimited). */
  remaining: number;
  canCreate: boolean;
  reason: "grandfathered" | "purchased" | "free-tier";
  /** A checkout was started but hasn't settled. */
  pending: boolean;
}

/**
 * Whether this restaurant may create another table QR.
 *
 * Reads the grandfather flag best-effort: on a database that hasn't run the
 * migration the column is missing, and the honest answer there is UNLIMITED,
 * not locked. Getting this backwards would cap every existing customer at one
 * table the moment the code deployed and before the migration landed — a
 * self-inflicted outage on the busiest screen they have.
 */
export async function getTableQrAccess(restaurantId: string): Promise<TableQrAccess> {
  const { tableQuota } = await import("@/lib/billing/table-quota");

  let grandfathered = true; // see above: assume the generous side
  try {
    const r = await systemDb((tx) =>
      tx.restaurant.findUnique({
        where: { id: restaurantId },
        select: { qrGrandfathered: true },
      }),
    );
    grandfathered = r?.qrGrandfathered ?? false;
  } catch {
    /* column not migrated — everyone stays unlimited until it is */
  }

  // The counter QR is not a table and never counts against the allowance.
  let tableCount = 0;
  try {
    tableCount = await systemDb((tx) =>
      tx.table.count({ where: { restaurantId, isCounter: false } }),
    );
  } catch {
    /* leave at zero rather than blocking on a count */
  }

  const purchased = await hasPaidAddon(restaurantId, UNLIMITED_TABLES_ADDON);
  // A plan MAY include it (nothing does today), and only off-trial — a trial
  // unlocking it would let anyone print a floor plan for free for a fortnight.
  const access = await getPlanAccess(restaurantId);
  const viaPlan = !access.onTrial && access.features.has("unlimitedTables");

  const quota = tableQuota({ tableCount, grandfathered, unlocked: purchased || viaPlan });
  const pending = quota.unlimited ? false : await hasPendingAddon(restaurantId, UNLIMITED_TABLES_ADDON);

  return { ...quota, tableCount, pending };
}
