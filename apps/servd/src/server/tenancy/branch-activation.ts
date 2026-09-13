import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { getPlatformBilling } from "@/server/billing/platform-settings";
import { XenditBillingProvider } from "@/server/billing/xendit";
import { provisionFreePlan } from "@/server/billing/subscription";
import { addonKeyFor } from "@/server/billing/owned-features";
import { ACTIVATION_PRICE } from "@/server/build/queries";

/**
 * Paying the ₱499 to switch a branch on.
 *
 * Same money and same Xendit invoice as a DIY activation, but a DIFFERENT
 * settlement — and that difference is the whole reason this exists rather than
 * reusing the build flow. A DIY activation ends by creating a Supabase user, a
 * staff row and emailing credentials, because the person paying has no account
 * yet. A branch already belongs to somebody: they're logged in, they pressed
 * the button. Running it through the build path would try to mint a second auth
 * user on an email that already exists, and post them a password for a login
 * they've been using all morning.
 *
 * So a branch activation grants exactly what the ₱499 buys — a live account
 * with online ordering owned outright — and touches nothing to do with
 * identity.
 */

/** Marks an ActivationRequest as a branch, so the two settlements can't cross. */
export const BRANCH_NOTE = "branch-activation";

export interface BranchCheckout {
  requestId: string;
  checkoutUrl: string;
}

export async function createBranchActivationCheckout(
  restaurantId: string,
): Promise<{ ok: true; checkout: BranchCheckout } | { ok: false; error: string }> {
  const billing = await getPlatformBilling();
  if (!billing.xendit?.secretKey) {
    return {
      ok: false,
      error: "Payments aren't set up yet — add the Xendit key in super-admin, then try again.",
    };
  }

  const restaurant = await systemDb((tx) =>
    tx.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true, displayName: true, status: true },
    }),
  );
  if (!restaurant) return { ok: false, error: "Branch not found." };
  if (restaurant.status === "active") {
    return { ok: false, error: "This branch is already active." };
  }

  // Reuse a still-payable invoice rather than stacking duplicates — an owner
  // who closes the Xendit tab and presses the button again should land back on
  // the same invoice, not generate a second one to reconcile later.
  const open = await systemDb((tx) =>
    tx.activationRequest.findFirst({
      where: { restaurantId, status: "pending", note: BRANCH_NOTE, checkoutUrl: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { id: true, checkoutUrl: true },
    }),
  );
  if (open?.checkoutUrl) {
    return { ok: true, checkout: { requestId: open.id, checkoutUrl: open.checkoutUrl } };
  }

  const request = await systemDb((tx) =>
    tx.activationRequest.create({
      data: { restaurantId, status: "pending", amount: ACTIVATION_PRICE, note: BRANCH_NOTE },
      select: { id: true },
    }),
  );

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const provider = new XenditBillingProvider(billing.xendit.secretKey, billing.xendit.callbackToken);
  try {
    const invoice = await provider.createInvoiceCheckout({
      amount: ACTIVATION_PRICE,
      description: `Servd branch activation — ${restaurant.displayName || restaurant.name}`,
      referenceNumber: request.id, // → Xendit external_id, and our idempotency key
      successUrl: `${base}/admin/branches?activated=1`,
    });
    await systemDb((tx) =>
      tx.activationRequest.update({
        where: { id: request.id },
        data: { providerRef: invoice.gatewayRef, checkoutUrl: invoice.checkoutUrl },
        select: { id: true },
      }),
    );
    return { ok: true, checkout: { requestId: request.id, checkoutUrl: invoice.checkoutUrl } };
  } catch {
    await systemDb((tx) =>
      tx.activationRequest.update({
        where: { id: request.id },
        data: { status: "abandoned" },
        select: { id: true },
      }),
    );
    return { ok: false, error: "Couldn't start the payment. Please try again in a moment." };
  }
}

/**
 * Settle a paid branch activation from the verified webhook.
 *
 * Returns false when the ref isn't a branch activation, so the webhook falls
 * through to the other handlers. Idempotent — Xendit retries, and a replay must
 * not grant the unlock twice or re-activate something already live.
 */
export async function activateBranchByProviderRef(providerRef: string): Promise<boolean> {
  if (!providerRef) return false;

  const request = await systemDb((tx) =>
    tx.activationRequest.findFirst({
      where: { providerRef, note: BRANCH_NOTE },
      select: { id: true, status: true, restaurantId: true },
    }),
  ).catch(() => null);
  if (!request) return false;
  if (request.status === "activated") return true; // replayed webhook — no-op

  try {
    await systemDb(async (tx) => {
      await tx.restaurant.update({
        where: { id: request.restaurantId },
        data: { status: "active" },
        select: { id: true },
      });

      // A never-expiring free plan, plus the online-ordering unlock recorded as
      // a purchase. Recorded rather than left to whatever the Free plan happens
      // to include, so the entitlement survives any later change to that plan —
      // they paid for it, so they own it. Exactly what the DIY ₱499 grants.
      await provisionFreePlan(tx, request.restaurantId);

      const addon = addonKeyFor("onlineOrdering");
      const already = await tx.addonPurchase.findFirst({
        where: { restaurantId: request.restaurantId, addon, status: "paid" },
        select: { id: true },
      });
      if (!already) {
        await tx.addonPurchase.create({
          data: {
            restaurantId: request.restaurantId,
            addon,
            amount: ACTIVATION_PRICE,
            status: "paid",
            providerRef: `branch:${request.id}`, // unique → a replay can't double-grant
            paidAt: new Date(),
          },
          select: { id: true },
        });
      }

      await tx.activationRequest.update({
        where: { id: request.id },
        data: { status: "activated", paidAt: new Date(), activatedAt: new Date() },
        select: { id: true },
      });
    });
    return true;
  } catch {
    // Claimed but failed: returning true stops the webhook falling through to
    // the DIY handler, which would try to create a login for an account that
    // already has one. The request stays pending and can be settled again.
    return true;
  }
}
