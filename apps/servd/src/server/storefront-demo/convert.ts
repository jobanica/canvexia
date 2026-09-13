import "server-only";

import { randomBytes } from "node:crypto";

import { systemDb } from "@/server/tenancy/scoped-db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeUsername } from "@/lib/partners/login-username";
import { getFreePlan, getDefaultPlan, getTopPlan, SIGNUP_TRIAL_DAYS } from "@/server/billing/subscription";
import { revokePreviewLogin } from "./preview-login";

/**
 * Turning a demo storefront into a real account.
 *
 * A demo is already a full tenant with a live /r/{slug} page — it just has no
 * login and an open-ended complimentary subscription so the ordering page stays
 * unlocked while it's being pitched. "Converting" it means two things: give it a
 * login, and put it on a real subscription. The menu, slug, QR codes and any
 * orders taken during the pitch all carry over untouched, which is the whole
 * point — the prospect keeps the thing they already saw working.
 *
 * Both the super-admin and a partner can do this, and they land on different
 * billing, which is the only thing that differs between them:
 *
 *   "trial30" — super-admin sells the account, so it starts a fresh 30-day
 *               Business trial and then bills normally.
 *   "free"    — a partner sets the restaurant up and bills that restaurant
 *               directly, at whatever price they agree. Servd charges the
 *               restaurant nothing, so the account lands on the ₱0 Free plan
 *               with paid features locked until somebody buys them.
 *
 * Shared so the two callers can't drift on the parts that MUST match: the
 * username rules, the "already has a login" check, and rolling the auth user
 * back if the database write fails (otherwise a half-converted account holds
 * the username hostage).
 */

const LOGIN_DOMAIN = process.env.INTERNAL_LOGIN_DOMAIN || "staff.servdph.com";

function syntheticEmail(username: string): string {
  return `${username}@${LOGIN_DOMAIN}`;
}

/**
 * A password to read down the phone: no O/0, l/1 or similar look-alikes, and
 * random from the CSPRNG rather than Math.random.
 */
function tempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[bytes[i] % chars.length];
  return out;
}

/**
 * Logins that make a storefront "already converted".
 *
 * Excludes the temporary preview login, which is a sales tool rather than an
 * account. Falls back to counting everything if the column isn't migrated —
 * where it doesn't exist no preview login can, so every staff row is real.
 */
async function countRealLogins(restaurantId: string): Promise<number> {
  try {
    return await systemDb((tx) =>
      tx.staffUser.count({ where: { restaurantId, previewExpiresAt: null } }),
    );
  } catch {
    return systemDb((tx) => tx.staffUser.count({ where: { restaurantId } }));
  }
}

export type ConvertBilling = "trial30" | "free";

export interface ConvertCredentials {
  username: string;
  password: string;
}

export type ConvertResult =
  | { ok: true; credentials: ConvertCredentials }
  | { ok: false; error: string };

/**
 * Move the tenant's subscription onto whichever plan this conversion implies.
 *
 * The demo is sitting on the TOP plan with a complimentary never-ending trial,
 * so this is not a no-op even for the free case: leaving it alone would hand a
 * real restaurant every paid feature for nothing.
 */
async function applyBilling(
  tx: Parameters<Parameters<typeof systemDb>[0]>[0],
  restaurantId: string,
  billing: ConvertBilling,
) {
  const plan =
    billing === "free"
      ? ((await getFreePlan(tx)) ?? (await getDefaultPlan(tx)))
      : ((await getTopPlan(tx)) ?? (await getDefaultPlan(tx)));
  if (!plan) return; // no plans seeded — leave the tenant as it is

  let trialEndsAt: Date | null = null;
  if (billing === "trial30") {
    trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + SIGNUP_TRIAL_DAYS);
  }

  await tx.restaurant.update({
    where: { id: restaurantId },
    data: { planId: plan.id },
    select: { id: true },
  });

  const sub = await tx.subscription.findFirst({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  // Free is `active` and never expires; a trial is `trialing` and does.
  const data = {
    planId: plan.id,
    status: billing === "free" ? ("active" as const) : ("trialing" as const),
    trialEndsAt,
    currentPeriodEnd: trialEndsAt,
  };
  if (sub) {
    await tx.subscription.update({ where: { id: sub.id }, data, select: { id: true } });
  } else {
    await tx.subscription.create({ data: { restaurantId, ...data }, select: { id: true } });
  }
}

/**
 * Attach a login to an existing demo tenant and put it on a real plan.
 *
 * Callers are responsible for authorization — the super-admin action checks
 * super-admin, the partner action checks that the partner owns this demo.
 */
export async function convertDemo(
  restaurantId: string,
  rawUsername: unknown,
  billing: ConvertBilling,
): Promise<ConvertResult> {
  const parsed = normalizeUsername(rawUsername);
  if (!parsed.ok) return parsed;
  const username = parsed.username;

  const info = await systemDb((tx) =>
    tx.restaurant.findFirst({
      where: { id: restaurantId },
      select: { id: true },
    }),
  );
  if (!info) return { ok: false, error: "Storefront not found." };

  // Count only REAL logins. A temporary preview login is issued to demo the
  // storefront to this very prospect, so treating it as "already converted"
  // would block the sale it exists to help close.
  const realLogins = await countRealLogins(restaurantId);
  if (realLogins > 0) return { ok: false, error: "This storefront already has a login." };

  const taken = await systemDb((tx) =>
    tx.staffUser.findFirst({ where: { username }, select: { id: true } }),
  );
  if (taken) return { ok: false, error: "That username is already taken." };

  const password = tempPassword();
  const email = syntheticEmail(username);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    const msg = error?.message ?? "Couldn't create the login.";
    return { ok: false, error: /registered|exists/i.test(msg) ? "That username is taken." : msg };
  }
  const authUserId = data.user.id;

  try {
    await systemDb(async (tx) => {
      await tx.staffUser.create({
        data: { restaurantId, authUserId, role: "admin", email, username },
        select: { id: true },
      });
      await applyBilling(tx, restaurantId, billing);
    });
  } catch (e) {
    // Undo the auth user, or the username is burned and the retry can't reuse it.
    try {
      await admin.auth.admin.deleteUser(authUserId);
    } catch {
      /* ignore cleanup failure */
    }
    const msg = e instanceof Error ? e.message : "Couldn't convert.";
    return { ok: false, error: /unique/i.test(msg) ? "That username is taken." : msg };
  }

  // The demo is now a real account, so the throwaway login has done its job.
  // After the conversion committed, deliberately: a failure to tidy up must not
  // undo a sale, and the preview login expires on its own regardless.
  try {
    await revokePreviewLogin(restaurantId);
  } catch {
    /* it expires by itself; never fail a completed conversion over cleanup */
  }

  return { ok: true, credentials: { username, password } };
}
