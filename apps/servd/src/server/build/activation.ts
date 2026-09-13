import "server-only";

import { randomBytes } from "node:crypto";
import { systemDb } from "@/server/tenancy/scoped-db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPlatformBilling } from "@/server/billing/platform-settings";
import { XenditBillingProvider } from "@/server/billing/xendit";
import { provisionFreePlan } from "@/server/billing/subscription";
import { addonKeyFor } from "@/server/billing/owned-features";
import { readBuildCookie } from "./session";
import { sendActivationEmail } from "@/server/email/transactional";
import { suppressOnActivation } from "@/server/email/followup";
import { ACTIVATION_PRICE } from "./queries";
import { BRANCH_NOTE } from "@/server/tenancy/branch-activation";
import { logEvent } from "@/server/bizops/events";

/**
 * Turning a paid DIY preview into a real account.
 *
 * 🚨 The one rule: activation is triggered ONLY by Xendit's verified webhook,
 * never by the browser redirect. A success URL can be typed in, replayed, or
 * never visited at all (the customer closes the tab after paying). The webhook
 * is Xendit's server calling ours with a shared secret — the only trustworthy
 * proof the ₱499 landed, and it fires whether or not the tab is still open.
 *
 * The success page therefore only *reads* the request's status; it cannot
 * activate anything.
 */

const LOGIN_EMAIL_DOMAIN = process.env.INTERNAL_LOGIN_DOMAIN || "staff.servdph.com";

function syntheticEmail(username: string): string {
  return `${username}@${LOGIN_EMAIL_DOMAIN}`;
}

/** Unguessable password we never show anyone — the owner sets their own via the
 *  claim link, so nothing sensitive is ever stored or displayed. */
function throwawayPassword(): string {
  return randomBytes(24).toString("base64url");
}

/** Username from the slug, made unique against existing logins. */
async function uniqueUsername(slug: string): Promise<string> {
  const root = slug.replace(/[^a-z0-9._-]/g, "").slice(0, 24) || "owner";
  for (let n = 0; n < 50; n++) {
    const candidate = n === 0 ? root : `${root}${n + 1}`;
    const taken = await systemDb((tx) =>
      tx.staffUser.findFirst({ where: { username: candidate }, select: { id: true } }),
    );
    if (!taken) return candidate;
  }
  return `${root}-${randomBytes(3).toString("hex")}`;
}

// ---------------------------------------------------------------------------
// 1. Requesting activation — creates the row + the hosted Xendit invoice
// ---------------------------------------------------------------------------

export interface ActivationCheckout {
  requestId: string;
  checkoutUrl: string;
}

/**
 * Creates a pending activation request and a Xendit hosted Invoice whose
 * `external_id` IS the request id — that's how the webhook knows which preview
 * to activate. Returns the URL to redirect the owner to.
 */
export async function createActivationCheckout(
  restaurantId: string,
): Promise<{ ok: true; checkout: ActivationCheckout } | { ok: false; error: string }> {
  const billing = await getPlatformBilling();
  if (!billing.xendit?.secretKey) {
    return { ok: false, error: "Payments aren't set up yet. Please message us and we'll activate you manually." };
  }

  const restaurant = await systemDb((tx) =>
    tx.restaurant.findFirst({
      where: { id: restaurantId, status: "preview" },
      select: { id: true, name: true, contactPhone: true, contactFb: true },
    }),
  );
  if (!restaurant) return { ok: false, error: "This preview is no longer available." };

  // Reuse a still-payable invoice rather than stacking duplicates.
  const open = await systemDb((tx) =>
    tx.activationRequest.findFirst({
      where: { restaurantId, status: "pending", checkoutUrl: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { id: true, checkoutUrl: true },
    }),
  );
  if (open?.checkoutUrl) {
    return { ok: true, checkout: { requestId: open.id, checkoutUrl: open.checkoutUrl } };
  }

  const request = await systemDb((tx) =>
    tx.activationRequest.create({
      data: {
        restaurantId,
        status: "pending",
        amount: ACTIVATION_PRICE,
        contactPhone: restaurant.contactPhone,
        contactFb: restaurant.contactFb,
      },
      select: { id: true },
    }),
  );

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const provider = new XenditBillingProvider(billing.xendit.secretKey, billing.xendit.callbackToken);
  let checkoutUrl: string;
  let gatewayRef: string;
  try {
    const invoice = await provider.createInvoiceCheckout({
      amount: ACTIVATION_PRICE,
      description: `Servd activation — ${restaurant.name}`,
      referenceNumber: request.id, // → Xendit external_id
      successUrl: `${base}/build/success?r=${request.id}`,
    });
    checkoutUrl = invoice.checkoutUrl;
    gatewayRef = invoice.gatewayRef;
  } catch {
    await systemDb((tx) =>
      tx.activationRequest.update({
        where: { id: request.id },
        data: { status: "abandoned", note: "invoice creation failed" },
        select: { id: true },
      }),
    );
    return { ok: false, error: "Couldn't start the payment. Please try again in a moment." };
  }

  await systemDb(async (tx) => {
    await tx.activationRequest.update({
      where: { id: request.id },
      data: { providerRef: gatewayRef, checkoutUrl },
      select: { id: true },
    });
    await tx.restaurant.update({
      where: { id: restaurantId },
      data: { activationRequestedAt: new Date() },
      select: { id: true },
    });
  });

  return { ok: true, checkout: { requestId: request.id, checkoutUrl } };
}

// ---------------------------------------------------------------------------
// 2. Activation — called ONLY from the verified webhook
// ---------------------------------------------------------------------------

/**
 * Flips a paid preview into a live account. Idempotent: an already-activated
 * request returns immediately, so Xendit's webhook retries can't create a
 * second login or grant the online-ordering unlock twice.
 */
async function activateRequest(requestId: string): Promise<boolean> {
  const request = await systemDb((tx) =>
    tx.activationRequest.findUnique({
      where: { id: requestId },
      select: { id: true, status: true, restaurantId: true, note: true },
    }),
  );
  if (!request) return false;
  // A branch activation is settled by server/tenancy/branch-activation, which
  // grants the same unlock without touching identity. This path would create a
  // login for an owner who already has one, so it must not claim those.
  if (request.note === BRANCH_NOTE) return false;
  if (request.status === "activated") return true; // replayed webhook — no-op

  const restaurant = await systemDb((tx) =>
    tx.restaurant.findUnique({
      where: { id: request.restaurantId },
      select: { id: true, slug: true, status: true, _count: { select: { staff: true } } },
    }),
  );
  if (!restaurant) return false;

  // Already has a login (a retry that got further last time) — just settle.
  if (restaurant._count.staff > 0) {
    await systemDb((tx) =>
      tx.activationRequest.update({
        where: { id: request.id },
        data: { status: "activated", paidAt: new Date(), activatedAt: new Date() },
        select: { id: true },
      }),
    );
    return true;
  }

  const username = await uniqueUsername(restaurant.slug);
  const email = syntheticEmail(username);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: throwawayPassword(),
    email_confirm: true,
  });
  if (error || !data.user) return false;
  const authUserId = data.user.id;

  try {
    await systemDb(async (tx) => {
      // One-time claim link the owner uses to set their own password. The
      // restaurant already carries claimToken/claimedAt for exactly this.
      await tx.restaurant.update({
        where: { id: restaurant.id },
        data: {
          status: "active",
          builtVia: "diy",
          // buildToken is deliberately KEPT: every builder path requires
          // status='preview', so it no longer grants any edit rights — it's now
          // only how we recognise the browser that did the building, which is
          // what gates the one-time claim link below.
          claimToken: randomBytes(24).toString("base64url"),
          claimedAt: null,
        },
        select: { id: true },
      });
      await tx.staffUser.create({
        data: { restaurantId: restaurant.id, authUserId, role: "admin", email, username },
        select: { id: true },
      });
      // The ₱499 buys the online ordering system outright — one payment, no
      // trial and no monthly fee. So: a lifetime (never-expiring) plan, plus a
      // recorded one-time purchase of onlineOrdering. Recording the purchase
      // rather than leaning on whatever the Free plan happens to include means
      // the entitlement survives any later change to that plan's features —
      // they paid for it, so they own it.
      await provisionFreePlan(tx, restaurant.id);
      const addon = addonKeyFor("onlineOrdering");
      const already = await tx.addonPurchase.findFirst({
        where: { restaurantId: restaurant.id, addon, status: "paid" },
        select: { id: true },
      });
      if (!already) {
        await tx.addonPurchase.create({
          data: {
            restaurantId: restaurant.id,
            addon,
            amount: ACTIVATION_PRICE,
            status: "paid",
            providerRef: `diy:${request.id}`, // unique → a replay can't double-grant
            paidAt: new Date(),
          },
          select: { id: true },
        });
      }
      await tx.activationRequest.update({
        where: { id: request.id },
        data: {
          status: "activated",
          loginUsername: username,
          paidAt: new Date(),
          activatedAt: new Date(),
        },
        select: { id: true },
      });
    });
  } catch {
    // Don't leave an orphaned auth user behind — the retry needs a clean slate.
    try {
      await admin.auth.admin.deleteUser(authUserId);
    } catch {
      /* ignore */
    }
    return false;
  }

  // THE suppression hook. They paid — every unsent acquisition email is
  // cancelled for good. From here the relationship is in-app, not in the inbox.
  await suppressOnActivation(restaurant.id);

  // Their username + set-password link, by email. Best-effort and last: a mail
  // failure must never undo an activation that already succeeded — the success
  // page and super-admin both still show the link.
  await sendActivationEmail(restaurant.id);

  // Business-ops timeline. Outside the transaction, after everything that
  // matters has committed, and it cannot throw — an analytics row must never
  // be the reason a paid activation reports failure and gets retried.
  await logEvent({
    restaurantId: restaurant.id,
    eventType: "activation",
    amount: ACTIVATION_PRICE,
    meta: { requestId: request.id, track: "diy" },
  });
  return true;
}

/**
 * Webhook entry point. Returns false when the ref isn't a DIY activation, so
 * the shared webhook route can fall through to the other payment kinds.
 */
export async function activatePreviewByProviderRef(providerRef: string): Promise<boolean> {
  if (!providerRef) return false;
  try {
    const request = await systemDb((tx) =>
      tx.activationRequest.findFirst({ where: { providerRef }, select: { id: true } }),
    );
    if (!request) return false;
    await activateRequest(request.id);
    return true; // ours either way — never fall through to plan activation
  } catch {
    return false;
  }
}

/** Webhook: the invoice expired or failed. The preview survives as a warm lead. */
export async function abandonPreviewByProviderRef(providerRef: string): Promise<boolean> {
  if (!providerRef) return false;
  try {
    const res = await systemDb((tx) =>
      tx.activationRequest.updateMany({
        where: { providerRef, status: "pending" },
        data: { status: "abandoned" },
      }),
    );
    if (res.count > 0) return true;
    // Already settled? Still ours — don't let it reach plan activation.
    const hit = await systemDb((tx) =>
      tx.activationRequest.findFirst({ where: { providerRef }, select: { id: true } }),
    );
    return !!hit;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 3. Success page — read-only status, plus a self-heal for a missing webhook
// ---------------------------------------------------------------------------

export interface ActivationStatus {
  status: "pending" | "paid" | "activated" | "abandoned";
  loginUsername: string | null;
  /** Only ever set for the browser that built the preview (see below). */
  claimUrl: string | null;
  /** Activated, but this browser can't be shown the claim link. */
  claimBlocked: boolean;
  restaurantName: string;
}

/**
 * Status for the "processing — your login is on the way" page. It may ASK
 * Xendit whether the invoice is paid (webhooks occasionally never arrive), but
 * a positive answer still routes through the same activation path — the browser
 * never asserts payment, it only prompts a server-to-server re-check.
 */
export async function getActivationStatus(requestId: string): Promise<ActivationStatus | null> {
  let row;
  try {
    row = await systemDb((tx) =>
      tx.activationRequest.findUnique({
        where: { id: requestId },
        select: {
          id: true,
          status: true,
          providerRef: true,
          loginUsername: true,
          restaurant: { select: { name: true, claimToken: true, buildToken: true } },
        },
      }),
    );
  } catch {
    return null;
  }
  if (!row) return null;

  if (row.status === "pending" && row.providerRef) {
    const billing = await getPlatformBilling();
    if (billing.xendit?.secretKey) {
      try {
        const provider = new XenditBillingProvider(
          billing.xendit.secretKey,
          billing.xendit.callbackToken,
        );
        const remote = await provider.getCheckoutStatus(row.providerRef);
        if (remote === "paid") {
          await activateRequest(row.id);
          return getActivationStatus(requestId);
        }
        if (remote === "failed") {
          await systemDb((tx) =>
            tx.activationRequest.updateMany({
              where: { id: row!.id, status: "pending" },
              data: { status: "abandoned" },
            }),
          );
        }
      } catch {
        /* leave it pending — the webhook is still the primary path */
      }
    }
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const claimToken = row.restaurant?.claimToken ?? null;
  // The claim link is a password-reset capability, so a request id alone must
  // not hand it out — a shared screenshot of this page would otherwise be an
  // account takeover. Only the browser that built the preview gets the link;
  // anyone else is told where to get it (and it's listed in super-admin).
  const isBuilder =
    !!row.restaurant?.buildToken && (await readBuildCookie()) === row.restaurant.buildToken;
  return {
    status: row.status as ActivationStatus["status"],
    loginUsername: row.loginUsername,
    claimUrl:
      row.status === "activated" && claimToken && isBuilder ? `${base}/claim/${claimToken}` : null,
    claimBlocked: row.status === "activated" && !!claimToken && !isBuilder,
    restaurantName: row.restaurant?.name ?? "Your restaurant",
  };
}
