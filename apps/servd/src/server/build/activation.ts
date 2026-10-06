import "server-only";

import { randomBytes } from "node:crypto";
import { systemDb } from "@/server/tenancy/scoped-db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { provisionTrial } from "@/server/billing/subscription";
import { queueSignupEvent } from "@/server/agent-portal/signup-event";
import { sendActivationEmail } from "@/server/email/transactional";
import { suppressOnActivation } from "@/server/email/followup";
import { logEvent } from "@/server/bizops/events";
import { internalLoginDomain } from "@/lib/branding/app-domain";

/**
 * Turning a DIY preview into a real account.
 *
 * This used to be gated on a ₱499 Xendit payment, settled by the gateway's
 * webhook. The gateway is retired (D38). The preview now becomes an account
 * straight away, on the same terms as a self-serve signup (D37): manual
 * billing, a 30-day trial, and customer.signed_up queued to the agent portal
 * with the referral code the visitor arrived with. The one-time activation is
 * paid afterwards, by bank or QR transfer, once the subscription agreement is
 * signed — from the Billing page like every other restaurant.
 *
 * What still gates it: the builder's own session (only the browser that built
 * the preview can activate it), a minimum menu, and the rate limit.
 */

const LOGIN_EMAIL_DOMAIN = internalLoginDomain();

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


export type ActivateResult = { ok: true; claimUrl: string } | { ok: false; error: string };

/**
 * Activate a preview. Idempotent: a second press after success returns the
 * same claim link rather than a second login.
 */
export async function activatePreview(restaurantId: string, rawAgentCode: string | null): Promise<ActivateResult> {
  const restaurant = await systemDb((tx) =>
    tx.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true, name: true, slug: true, status: true, claimToken: true,
        contactPhone: true, contactFb: true,
        _count: { select: { staff: true } },
      },
    }),
  );
  if (!restaurant) return { ok: false, error: "This preview is no longer available." };
  if (restaurant.status !== "preview") {
    return restaurant.claimToken
      ? { ok: true, claimUrl: `/claim/${restaurant.claimToken}` }
      : { ok: false, error: "This preview has already been activated." };
  }

  const username = await uniqueUsername(restaurant.slug);
  const email = syntheticEmail(username);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: throwawayPassword(),
    email_confirm: true,
  });
  if (error || !data.user) return { ok: false, error: "Couldn't create your account. Please try again." };
  const authUserId = data.user.id;
  const claimToken = randomBytes(24).toString("base64url");

  try {
    await systemDb(async (tx) => {
      // Guarded on status so two presses at once cannot both convert it.
      const flipped = await tx.restaurant.updateMany({
        where: { id: restaurant.id, status: "preview" },
        data: {
          status: "active",
          builtVia: "diy",
          billingMode: "manual",
          claimToken,
          claimedAt: null,
          activationRequestedAt: new Date(),
        },
      });
      if (flipped.count !== 1) throw new Error("already activated");
      await tx.staffUser.create({
        data: { restaurantId: restaurant.id, authUserId, role: "admin", email, username },
        select: { id: true },
      });
      await provisionTrial(tx, restaurant.id);
      await tx.activationRequest.create({
        data: {
          restaurantId: restaurant.id,
          status: "activated",
          amount: 0,
          note: "manual-billing",
          contactPhone: restaurant.contactPhone,
          contactFb: restaurant.contactFb,
          loginUsername: username,
          activatedAt: new Date(),
        },
        select: { id: true },
      });
      await queueSignupEvent(tx, {
        restaurantId: restaurant.id,
        businessName: restaurant.name,
        ownerPhone: restaurant.contactPhone,
        agentCode: rawAgentCode,
      });
    });
  } catch (e) {
    await admin.auth.admin.deleteUser(authUserId).catch(() => {});
    if (e instanceof Error && e.message === "already activated") {
      const again = await systemDb((tx) =>
        tx.restaurant.findUnique({ where: { id: restaurant.id }, select: { claimToken: true } }),
      );
      if (again?.claimToken) return { ok: true, claimUrl: `/claim/${again.claimToken}` };
    }
    return { ok: false, error: "Couldn't activate your preview. Please try again." };
  }

  await suppressOnActivation(restaurant.id);
  await sendActivationEmail(restaurant.id).catch(() => {});
  await logEvent({ restaurantId: restaurant.id, eventType: "activation", amount: 0, meta: { track: "diy", billing: "manual" } });
  return { ok: true, claimUrl: `/claim/${claimToken}` };
}
