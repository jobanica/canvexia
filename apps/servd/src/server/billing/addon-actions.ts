"use server";

import { revalidatePath } from "next/cache";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import { getBillingProvider } from "@/server/billing";
import { isFeature, type Feature } from "@/lib/billing/features";
import { addonKeyFor, listOwnedFeatures } from "@/server/billing/owned-features";
import { getFeaturePrices } from "@/server/billing/feature-pricing";
import { getPlanAccess } from "@/server/billing/feature-gate";
import { getCustomDomainAccess } from "@/server/billing/addons";
import {
  MONTHLY_FEATURES,
  isMonthlyFeature,
  getFeatureSubscription,
  activateFeatureSubByProviderRef,
} from "@/server/billing/feature-subscriptions";

export type UnlockResult = { checkoutUrl: string } | { error: string };
export type VerifyResult = { unlocked: true } | { unlocked: false; message: string };

/** Refresh everywhere a newly-owned feature changes what's visible. */
function refreshAfterUnlock() {
  revalidatePath("/admin/billing");
  revalidatePath("/admin/domains");
  revalidatePath("/admin", "layout");
}

/**
 * Start a hosted checkout to buy a feature outright. Mirrors the subscription
 * flow: this only creates the pending purchase + checkout — access is granted
 * by the signature-verified webhook (or the "already paid?" check), never here.
 */
export async function startFeatureUnlock(featureKey: string): Promise<UnlockResult> {
  const { restaurantId } = await requireAdminAction();
  if (!isFeature(featureKey)) return { error: "Unknown feature." };
  const feature: Feature = featureKey;

  // Already granted by the plan, or already bought → nothing to sell.
  const [access, owned, prices] = await Promise.all([
    getPlanAccess(restaurantId),
    listOwnedFeatures(restaurantId),
    getFeaturePrices(),
  ]);
  if (owned.has(feature)) return { error: "You already own this feature." };
  // A live trial unlocks everything temporarily; custom domain deliberately
  // doesn't count, so buying during a trial stays possible for it.
  if (feature !== "customDomain" && !access.onTrial && access.features.has(feature)) {
    return { error: "Your plan already includes this feature." };
  }

  const priced = prices[feature];
  if (!priced?.enabled || priced.price <= 0) {
    return { error: "This feature isn't available to buy right now." };
  }

  const provider = await getBillingProvider();
  if (!provider) return { error: "Payments aren't configured on the platform yet." };

  const addon = addonKeyFor(feature);
  let purchaseId: string;
  try {
    purchaseId = await tenantDb(restaurantId, async (tx) => {
      const existing = await tx.addonPurchase.findFirst({
        where: { restaurantId, addon, status: "pending" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (existing) return existing.id;
      const created = await tx.addonPurchase.create({
        data: { restaurantId, addon, amount: priced.price, status: "pending" },
        select: { id: true },
      });
      return created.id;
    });
  } catch {
    return { error: "Couldn't start the purchase. Please try again." };
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  let checkout;
  try {
    checkout = await provider.createInvoiceCheckout({
      amount: priced.price,
      description: `Servd — ${feature} (one-time unlock)`,
      // Prefixed so it's obvious in the gateway this isn't a subscription.
      referenceNumber: `add-${purchaseId.slice(0, 12)}`,
      successUrl: `${base}/admin/billing?unlocked=${encodeURIComponent(feature)}`,
    });
  } catch {
    return { error: "Couldn't start checkout. Please try again." };
  }

  try {
    await tenantDb(restaurantId, (tx) =>
      tx.addonPurchase.update({ where: { id: purchaseId }, data: { providerRef: checkout.gatewayRef } }),
    );
  } catch {
    return { error: "Couldn't start checkout. Please try again." };
  }
  return { checkoutUrl: checkout.checkoutUrl };
}

/**
 * "I've already paid" — ask the gateway what actually happened to a pending
 * checkout and settle it. The webhook is the normal path; this is the safety
 * net so a missed callback never strands a paying customer.
 */
export async function verifyFeatureUnlock(featureKey: string): Promise<VerifyResult> {
  const { restaurantId } = await requireAdminAction();
  if (!isFeature(featureKey)) return { unlocked: false, message: "Unknown feature." };
  const addon = addonKeyFor(featureKey);

  const owned = await listOwnedFeatures(restaurantId);
  if (owned.has(featureKey)) return { unlocked: true };

  let pending: { id: string; providerRef: string | null } | null = null;
  try {
    pending = await tenantDb(restaurantId, (tx) =>
      tx.addonPurchase.findFirst({
        where: { restaurantId, addon, status: "pending" },
        orderBy: { createdAt: "desc" },
        select: { id: true, providerRef: true },
      }),
    );
  } catch {
    return { unlocked: false, message: "Couldn't check right now. Please try again." };
  }
  if (!pending?.providerRef) {
    return { unlocked: false, message: "We couldn't find a payment to check." };
  }

  const provider = await getBillingProvider();
  if (!provider?.getCheckoutStatus) {
    return { unlocked: false, message: "We couldn't verify automatically. Please contact support." };
  }

  let status: "paid" | "pending" | "failed";
  try {
    status = await provider.getCheckoutStatus(pending.providerRef);
  } catch {
    return { unlocked: false, message: "Couldn't reach the payment provider. Please try again shortly." };
  }
  if (status !== "paid") {
    return {
      unlocked: false,
      message:
        status === "failed"
          ? "That payment didn't go through. Please try again."
          : "We can't see your payment yet. If you've just paid, wait a moment and check again.",
    };
  }

  try {
    await tenantDb(restaurantId, (tx) =>
      tx.addonPurchase.update({ where: { id: pending.id }, data: { status: "paid", paidAt: new Date() } }),
    );
  } catch {
    return { unlocked: false, message: "Couldn't apply the unlock. Please contact support." };
  }
  refreshAfterUnlock();
  return { unlocked: true };
}

// ---------------------------------------------------------------------------
// Back-compat wrappers for the custom-domain screen (shipped before this was
// generalised).
// ---------------------------------------------------------------------------

export async function startCustomDomainUnlock(): Promise<UnlockResult> {
  const { restaurantId } = await requireAdminAction();
  const access = await getCustomDomainAccess(restaurantId);
  if (access.allowed) return { error: "Custom domains are already unlocked for this account." };
  return startFeatureUnlock("customDomain");
}

export async function verifyCustomDomainUnlock(): Promise<VerifyResult> {
  const res = await verifyFeatureUnlock("customDomain");
  if (res.unlocked) revalidatePath("/admin/domains");
  return res;
}

// ---------------------------------------------------------------------------
// Monthly per-feature subscriptions (e.g. the ₱499/mo content scheduler)
// ---------------------------------------------------------------------------

/**
 * Start checkout for the FIRST month of a monthly feature. Access is granted by
 * the signature-verified webhook, never here — so nothing unlocks until the
 * money actually lands.
 */
export async function startFeatureSubscription(featureKey: string): Promise<UnlockResult> {
  const { restaurantId } = await requireAdminAction();
  if (!isFeature(featureKey) || !isMonthlyFeature(featureKey)) return { error: "Unknown feature." };
  const meta = MONTHLY_FEATURES[featureKey];

  const current = await getFeatureSubscription(restaurantId, featureKey);
  if (current.active) return { error: "This is already active on your account." };

  const provider = await getBillingProvider();
  if (!provider) return { error: "Payments aren't configured on the platform yet." };

  let subId: string;
  try {
    subId = await tenantDb(restaurantId, async (tx) => {
      const row = await tx.featureSubscription.upsert({
        where: { restaurantId_feature: { restaurantId, feature: featureKey } },
        create: {
          restaurantId,
          feature: featureKey,
          status: "pending",
          priceMonthly: meta.priceMonthly,
        },
        update: { priceMonthly: meta.priceMonthly },
        select: { id: true },
      });
      return row.id;
    });
  } catch {
    return { error: "Couldn't start the purchase. Please try again." };
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  let checkout;
  try {
    checkout = await provider.createInvoiceCheckout({
      amount: meta.priceMonthly,
      description: `Servd ${meta.label} — 1 month`,
      referenceNumber: `sub-${subId.slice(0, 12)}`,
      successUrl: `${base}/admin/content?subscribed=1`,
    });
  } catch {
    return { error: "Couldn't start checkout. Please try again." };
  }

  try {
    await tenantDb(restaurantId, (tx) =>
      tx.featureSubscription.update({
        where: { id: subId },
        data: { providerRef: checkout.gatewayRef },
      }),
    );
  } catch {
    return { error: "Couldn't start checkout. Please try again." };
  }
  return { checkoutUrl: checkout.checkoutUrl };
}

/** "I've already paid" fallback for a monthly feature, when a webhook is missed. */
export async function verifyFeatureSubscription(featureKey: string): Promise<VerifyResult> {
  const { restaurantId } = await requireAdminAction();
  if (!isFeature(featureKey) || !isMonthlyFeature(featureKey)) {
    return { unlocked: false, message: "Unknown feature." };
  }
  const current = await getFeatureSubscription(restaurantId, featureKey);
  if (current.active) return { unlocked: true };

  let ref: string | null = null;
  try {
    const row = await tenantDb(restaurantId, (tx) =>
      tx.featureSubscription.findFirst({
        where: { restaurantId, feature: featureKey },
        select: { providerRef: true },
      }),
    );
    ref = row?.providerRef ?? null;
  } catch {
    return { unlocked: false, message: "Couldn't check right now. Please try again." };
  }
  if (!ref) return { unlocked: false, message: "We couldn't find a payment to check." };

  const provider = await getBillingProvider();
  if (!provider?.getCheckoutStatus) {
    return { unlocked: false, message: "We couldn't verify automatically. Please contact support." };
  }
  let status: "paid" | "pending" | "failed";
  try {
    status = await provider.getCheckoutStatus(ref);
  } catch {
    return { unlocked: false, message: "Couldn't reach the payment provider. Please try again shortly." };
  }
  if (status !== "paid") {
    return {
      unlocked: false,
      message:
        status === "failed"
          ? "That payment didn't go through. Please try again."
          : "We can't see your payment yet. If you've just paid, wait a moment and check again.",
    };
  }

  await activateFeatureSubByProviderRef(ref);
  revalidatePath("/admin/content");
  return { unlocked: true };
}
