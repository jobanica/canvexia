import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { systemDb, pharmacyDb } from "@/server/tenancy/scoped-db";
import type { PharmacyRole } from "@/lib/pharmacy/roles";

/**
 * Adding and removing staff.
 *
 * Two systems have to agree: Supabase Auth holds the credential, and
 * `pharmacy_staff` holds the membership and the role. Neither is useful alone —
 * an Auth user with no membership signs in and is treated as signed out
 * (`getCurrentStaff` returns null), and a membership with no Auth user is a row
 * nobody can ever use.
 *
 * The order matters: create the Auth user FIRST, then the membership. The
 * reverse leaves a membership pointing at an `authUserId` that does not exist
 * if the second step fails — a staff row that looks fine in the list and can
 * never be signed into.
 */

export type AddStaffFailure =
  | "already_staff"
  | "auth_failed"
  | "invalid_input"
  | "not_configured";

export type AddStaffOutcome =
  | { ok: true; staffId: string; email: string }
  | { ok: false; reason: AddStaffFailure; message: string };

export async function addStaff(input: {
  pharmacyId: string;
  email: string;
  password: string;
  role: PharmacyRole;
  displayName?: string;
  /** The staff row doing this, for the audit trail. */
  actorStaffId: string;
}): Promise<AddStaffOutcome> {
  const email = input.email.trim().toLowerCase();
  if (!email || input.password.length < 8) {
    return {
      ok: false,
      reason: "invalid_input",
      message: "An email and a password of at least 8 characters are required.",
    };
  }

  // Scoped read: under RLS this cannot see another pharmacy's staff, so a
  // duplicate here means a duplicate HERE.
  const existing = await pharmacyDb(input.pharmacyId, (tx) =>
    tx.pharmacyStaff.findFirst({ where: { email }, select: { id: true } }),
  );
  if (existing) {
    return {
      ok: false,
      reason: "already_staff",
      message: `${email} already has an account at this pharmacy.`,
    };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return {
      ok: false,
      reason: "not_configured",
      message:
        "SUPABASE_SERVICE_ROLE_KEY is not set, so accounts cannot be created from here.",
    };
  }

  // May already exist: the same person can be staff at two pharmacies, and that
  // is one Auth user with two memberships, not two logins.
  let authUserId: string | null = null;
  const created = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
  });

  if (created.data?.user) {
    authUserId = created.data.user.id;
  } else if (created.error && /already been registered|already exists/i.test(created.error.message)) {
    const { data } = await admin.auth.admin.listUsers();
    authUserId = data?.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
  }

  if (!authUserId) {
    return {
      ok: false,
      reason: "auth_failed",
      message: created.error?.message ?? "Could not create that login.",
    };
  }

  // systemDb, not pharmacyDb: the row does not exist yet, so there is nothing
  // for the tenant policy's `using` arm to match on the read side of an upsert.
  // The pharmacyId written is the caller's own, taken from the session.
  const staff = await systemDb(async (tx) => {
    const row = await tx.pharmacyStaff.create({
      data: {
        pharmacyId: input.pharmacyId,
        authUserId,
        email,
        role: input.role,
        displayName: input.displayName?.trim() || null,
      },
      select: { id: true, email: true },
    });
    await tx.auditLog.create({
      data: {
        actorType: "merchant",
        actorStaffId: input.actorStaffId,
        action: "pharmacy.staff.add",
        entityType: "pharmacy_staff",
        entityId: row.id,
        after: { email, role: input.role, pharmacyId: input.pharmacyId },
      },
    });
    return row;
  });

  return { ok: true, staffId: staff.id, email: staff.email };
}

/**
 * Remove a membership.
 *
 * The Auth user is deliberately left alone. It may be the person's login at
 * another pharmacy, and deleting it there would be one branch removing
 * somebody's access to a different branch. Without a membership they cannot
 * reach anything here anyway.
 */
export async function removeStaff(input: {
  pharmacyId: string;
  staffId: string;
  actorStaffId: string;
}): Promise<{ ok: boolean; message?: string }> {
  if (input.staffId === input.actorStaffId) {
    return { ok: false, message: "You can't remove your own account." };
  }

  // Scoped: a staffId from another pharmacy simply is not found.
  const row = await pharmacyDb(input.pharmacyId, (tx) =>
    tx.pharmacyStaff.findUnique({
      where: { id: input.staffId },
      select: { id: true, email: true, role: true },
    }),
  );
  if (!row) return { ok: false, message: "No such account at this pharmacy." };

  // Never leave a pharmacy with nobody who can add staff back.
  if (row.role === "owner") {
    const owners = await pharmacyDb(input.pharmacyId, (tx) =>
      tx.pharmacyStaff.count({ where: { role: "owner" } }),
    );
    if (owners <= 1) {
      return { ok: false, message: "That's the only owner — promote someone else first." };
    }
  }

  await systemDb(async (tx) => {
    await tx.pharmacyStaff.delete({ where: { id: row.id } });
    await tx.auditLog.create({
      data: {
        actorType: "merchant",
        actorStaffId: input.actorStaffId,
        action: "pharmacy.staff.remove",
        entityType: "pharmacy_staff",
        entityId: row.id,
        before: { email: row.email, role: row.role, pharmacyId: input.pharmacyId },
      },
    });
  });

  return { ok: true };
}

export async function listStaff(pharmacyId: string) {
  return pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyStaff.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, displayName: true, role: true, createdAt: true },
    }),
  );
}
