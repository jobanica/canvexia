import "server-only";
import { randomBytes } from "node:crypto";
import { systemDb } from "@/server/tenancy/scoped-db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { writePartnerAudit } from "@/server/audit/log";

/**
 * HANDING A PHARMACY OWNER THEIR LOGIN.
 *
 * REPORTED — "I activated it, but I cannot see the login details of the
 * account."
 *
 * There were none, and no way to make any. A pharmacy could be signed,
 * provisioned and activated from the portal, and the FIRST account at it came
 * from `pnpm --filter resceta staff:create` — a CLI run by whoever holds the
 * service-role key. So the partner's flow ended one step short of a usable
 * product: the shop existed, it was live, and nobody could sign in to it.
 *
 * The same gap Servd had until `convertPartnerDemo`, and this is its twin.
 *
 * A REAL EMAIL, not a synthetic one. Servd mints `username@<internal domain>`
 * because a restaurant's till login is a username; Resceta signs in with an
 * email, and using a real one means the owner can use Forgot password without
 * anybody's help. It is also the address the partner already has, because they
 * just sold to them.
 *
 * AUTH USER FIRST, MEMBERSHIP SECOND — never the reverse, which leaves a
 * `pharmacy_staff` row pointing at an `authUserId` that does not exist: a
 * membership that looks fine in the staff list and can never be signed into.
 * The same rule the bootstrap script is built on, for the same reason.
 */

export interface PharmacyOwnerState {
  /** True once anybody is staff here — the CLI counts, and so does /staff. */
  hasStaff: boolean;
  /** The owner's address, when there is one, so the page can show it. */
  ownerEmail: string | null;
}

export async function pharmacyOwnerState(
  partnerId: string,
  pharmacyId: string,
): Promise<PharmacyOwnerState> {
  try {
    const rows = await systemDb((tx) =>
      tx.pharmacyStaff.findMany({
        // Ownership through the pharmacy, in the WHERE clause: a pharmacy
        // belonging to another partner matches nothing rather than leaking who
        // works there.
        where: { pharmacy: { id: pharmacyId, partnerId } },
        select: { email: true, role: true },
        orderBy: { createdAt: "asc" },
      }),
    );
    return {
      hasStaff: rows.length > 0,
      ownerEmail: rows.find((r) => r.role === "owner")?.email ?? null,
    };
  } catch {
    // Not migrated, or unreadable. "Nobody yet" is the safe answer: it offers
    // the form, and the create path refuses a duplicate on its own.
    return { hasStaff: false, ownerEmail: null };
  }
}

export type CreateOwnerResult =
  | { ok: true; credentials: { email: string; password: string } }
  | { ok: false; error: string };

/**
 * TWELVE BYTES, base64url. Long enough that it is not guessable and short
 * enough that somebody can read it down a phone to the owner standing in front
 * of them, which is exactly how this gets used.
 */
function tempPassword(): string {
  return randomBytes(12).toString("base64url");
}

export async function createPharmacyOwner(input: {
  partnerId: string;
  pharmacyId: string;
  email: string;
  name: string | null;
  actorEmail: string;
}): Promise<CreateOwnerResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "That email address does not look right." };
  }

  const pharmacy = await systemDb((tx) =>
    tx.pharmacy.findFirst({
      where: { id: input.pharmacyId, partnerId: input.partnerId },
      select: { id: true, name: true, displayName: true },
    }),
  ).catch(() => null);
  // Not found and not yours are the same answer, deliberately: a partner
  // probing ids should not learn which of the two it was.
  if (!pharmacy) return { ok: false, error: "That pharmacy was not found." };

  const existing = await systemDb((tx) =>
    tx.pharmacyStaff.findFirst({
      where: { pharmacyId: pharmacy.id },
      select: { email: true },
    }),
  ).catch(() => null);
  if (existing) {
    return {
      ok: false,
      error: `This pharmacy already has a login (${existing.email}). Add more staff from inside Resceta.`,
    };
  }

  const admin = createSupabaseAdminClient();
  const password = tempPassword();

  /**
   * The same address may already be a Supabase user — one person can be staff
   * at two pharmacies, and that is one login with two memberships. Creating
   * fails in that case, so the existing user is found and reused.
   *
   * `createdHere` is what decides whether a failed membership write may delete
   * the auth user afterwards. Deleting one we did not create would take away
   * somebody's login at a different pharmacy.
   */
  let authUserId: string;
  let createdHere = true;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.data?.user) {
    authUserId = created.data.user.id;
  } else {
    const msg = created.error?.message ?? "";
    if (!/already been registered|already exists|registered/i.test(msg)) {
      return { ok: false, error: `Could not create that login: ${msg}` };
    }
    const found = await admin.auth.admin
      .listUsers()
      .then((r) => r.data?.users.find((u) => u.email?.toLowerCase() === email))
      .catch(() => null);
    if (!found) return { ok: false, error: "That address is registered but could not be found." };
    authUserId = found.id;
    createdHere = false;
    // They already have a password somewhere else, and we are about to read a
    // new one out loud — so set it, or the credentials shown would be wrong.
    const reset = await admin.auth.admin.updateUserById(authUserId, { password });
    if (reset.error) {
      return { ok: false, error: "That address already has a login we could not update." };
    }
  }

  try {
    await systemDb(async (tx) => {
      await tx.pharmacyStaff.create({
        data: {
          pharmacyId: pharmacy.id,
          authUserId,
          email,
          role: "owner",
          displayName: input.name?.trim() || null,
        },
        select: { id: true },
      });
      await writePartnerAudit(tx, input.partnerId, {
        actorEmail: input.actorEmail,
        action: "pharmacy.owner_created",
        entityType: "pharmacy",
        entityId: pharmacy.id,
        // The address, never the password. It is read out once and lives
        // nowhere — not here, not in the database, not in a log.
        after: { ownerEmail: email, role: "owner" },
      });
    });
  } catch (e) {
    // Undo the auth user, or the address is burned and a retry cannot reuse it.
    // Only if we made it: deleting one that already existed would take away
    // somebody's login at another pharmacy.
    if (createdHere) {
      await admin.auth.admin.deleteUser(authUserId).catch(() => {});
    }
    const msg = e instanceof Error ? e.message : "";
    return {
      ok: false,
      error: /unique/i.test(msg)
        ? "That address is already staff at this pharmacy."
        : "Couldn't create the login. Try again.",
    };
  }

  return { ok: true, credentials: { email, password } };
}

/**
 * RE-ISSUE A PASSWORD, because the one above is shown once and lives nowhere.
 *
 * Without this, an owner who closed the page before copying it is locked out
 * with no self-serve route — Resceta's Forgot password works, but only if they
 * can receive mail at that address, and a partner standing in the shop should
 * not have to hope.
 */
export async function resetPharmacyOwnerPassword(input: {
  partnerId: string;
  pharmacyId: string;
  actorEmail: string;
}): Promise<CreateOwnerResult> {
  const seat = await systemDb((tx) =>
    tx.pharmacyStaff.findFirst({
      where: { pharmacy: { id: input.pharmacyId, partnerId: input.partnerId }, role: "owner" },
      select: { authUserId: true, email: true },
    }),
  ).catch(() => null);
  if (!seat) return { ok: false, error: "This pharmacy has no owner login to reset." };

  const password = tempPassword();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(seat.authUserId, { password });
  if (error) return { ok: false, error: "Couldn't reset that password. Try again." };

  // AFTER the change, and swallowed: the password is already different by now,
  // and saying otherwise would send somebody to read out one that no longer
  // works.
  try {
    await systemDb((tx) =>
      writePartnerAudit(tx, input.partnerId, {
        actorEmail: input.actorEmail,
        action: "pharmacy.owner_password_reset",
        entityType: "pharmacy",
        entityId: input.pharmacyId,
        after: { ownerEmail: seat.email },
      }),
    );
  } catch {
    /* the password is changed either way */
  }

  return { ok: true, credentials: { email: seat.email, password } };
}
