import "server-only";

import { randomBytes } from "node:crypto";

import { systemDb } from "@/server/tenancy/scoped-db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { previewExpiryFrom } from "@/lib/preview-login/expiry";

/**
 * A throwaway merchant login for showing a demo storefront to a prospect.
 *
 * The pitch is: hand them a phone, they scan the QR and order, and the order
 * lands on the merchant screen in front of them. That needs a login, and this
 * is the smallest one that works — role `merchant`, which opens the Incoming
 * Orders screen and nothing else. No cashier, no admin, no settings.
 *
 * Three rules hold this together, and all three exist so this can never cost a
 * sale or leak into a real restaurant's account:
 *
 *   1. It expires by itself (7 days), and the session layer enforces that on
 *      every request rather than trusting a cleanup job.
 *   2. Conversion ignores it — a demo with a preview login still converts, and
 *      the login is deleted as part of converting.
 *   3. One per storefront. Issuing again replaces the old one, so credentials
 *      handed out last week stop working.
 */

const LOGIN_DOMAIN = process.env.INTERNAL_LOGIN_DOMAIN || "staff.servdph.com";

/** Marks the synthetic address so a preview login is obvious in auth.users. */
const PREVIEW_PREFIX = "preview";

/**
 * A password to read down the phone: no O/0 or l/1 look-alikes, from the
 * CSPRNG. Same alphabet as the conversion password for the same reason —
 * somebody is going to type this off a screen in a noisy restaurant.
 */
function tempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[bytes[i] % chars.length];
  return out;
}

export interface PreviewCredentials {
  username: string;
  password: string;
  expiresAt: string;
}

export type PreviewLoginResult =
  | { ok: true; credentials: PreviewCredentials }
  | { ok: false; error: string };

/** The preview login on a storefront, if it has one. */
export async function getPreviewLogin(
  restaurantId: string,
): Promise<{ username: string | null; expiresAt: string } | null> {
  try {
    const row = await systemDb((tx) =>
      tx.staffUser.findFirst({
        where: { restaurantId, previewExpiresAt: { not: null } },
        select: { username: true, previewExpiresAt: true },
      }),
    );
    if (!row?.previewExpiresAt) return null;
    return { username: row.username, expiresAt: row.previewExpiresAt.toISOString() };
  } catch {
    return null; // column not migrated — no preview login can exist
  }
}

/**
 * Delete the storefront's preview login, in the database and in Supabase Auth.
 *
 * Best-effort on the auth side: if the row is gone the login is already dead,
 * because the session layer resolves identity through staff_users. Leaving an
 * orphaned auth user is untidy, not dangerous, and must not fail a conversion.
 */
export async function revokePreviewLogin(restaurantId: string): Promise<void> {
  let rows: { id: string; authUserId: string }[];
  try {
    rows = await systemDb((tx) =>
      tx.staffUser.findMany({
        where: { restaurantId, previewExpiresAt: { not: null } },
        select: { id: true, authUserId: true },
      }),
    );
  } catch {
    return; // not migrated — nothing to revoke
  }
  if (rows.length === 0) return;

  await systemDb((tx) =>
    tx.staffUser.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } }),
  );

  const admin = createSupabaseAdminClient();
  for (const r of rows) {
    try {
      await admin.auth.admin.deleteUser(r.authUserId);
    } catch {
      /* the staff row is gone, so the login no longer resolves */
    }
  }
}

/**
 * Issue a fresh preview login for a demo storefront.
 *
 * Replaces any existing one, so the credentials on screen are always the only
 * ones that work — handing out a second set while the first still opened the
 * account would be worse than useless.
 */
export async function createPreviewLogin(restaurantId: string): Promise<PreviewLoginResult> {
  const shop = await systemDb((tx) =>
    tx.restaurant.findFirst({ where: { id: restaurantId }, select: { id: true, slug: true } }),
  );
  if (!shop) return { ok: false, error: "Storefront not found." };

  await revokePreviewLogin(restaurantId);

  // Namespaced by slug so the address says what it is at a glance, and suffixed
  // so a reissue never collides with an auth user that failed to delete.
  const suffix = randomBytes(3).toString("hex");
  const username = `${PREVIEW_PREFIX}-${shop.slug}-${suffix}`.slice(0, 60);
  const email = `${username}@${LOGIN_DOMAIN}`;
  const password = tempPassword();
  const expiresAt = previewExpiryFrom();

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    return { ok: false, error: error?.message ?? "Couldn't create the preview login." };
  }

  try {
    await systemDb((tx) =>
      tx.staffUser.create({
        data: {
          restaurantId,
          authUserId: data.user!.id,
          role: "merchant",
          email,
          username,
          displayName: "Preview (temporary)",
          previewExpiresAt: expiresAt,
        },
        select: { id: true },
      }),
    );
  } catch (e) {
    // Undo the auth user, or a retry collides with a login nothing points at.
    try {
      await admin.auth.admin.deleteUser(data.user.id);
    } catch {
      /* ignore cleanup failure */
    }
    const msg = e instanceof Error ? e.message : "Couldn't create the preview login.";
    return {
      ok: false,
      error: /previewExpiresAt|column/i.test(msg)
        ? "Run prisma/manual/add-preview-login.sql, then try again."
        : msg,
    };
  }

  return { ok: true, credentials: { username, password, expiresAt: expiresAt.toISOString() } };
}
