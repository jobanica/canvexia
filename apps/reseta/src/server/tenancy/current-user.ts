import "server-only";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { systemDb } from "@/server/tenancy/scoped-db";
import { pickPharmacy, PHARMACY_COOKIE } from "@/lib/pharmacy/active-pharmacy";
import { can, type Permission, type PharmacyRole } from "@/lib/pharmacy/roles";

/**
 * Who is signed in, and which pharmacy they are acting for.
 *
 * CRITICAL: `pharmacyId` is derived ONLY from the session and the membership
 * rows. Never from the URL, never from the request body. Everything downstream
 * scopes to this value, so if it could come from the browser the whole tenancy
 * argument would have a door in it.
 *
 * That is why the routes have no `[slug]` segment any more. A slug in the path
 * is a pharmacy id the browser chose, and having one at all invites exactly one
 * forgotten check.
 *
 * Runs under systemDb because it is resolving identity itself — there is no
 * tenant scope to be in until this returns one. It reads two tables and
 * nothing else.
 */

export interface CurrentStaff {
  authUserId: string;
  staffId: string;
  pharmacyId: string;
  pharmacyName: string;
  pharmacySlug: string;
  pharmacyStatus: string;
  vatRatePct: number;
  role: PharmacyRole;
  email: string;
  displayName: string | null;
  /** Every pharmacy this login is staff at, for the switcher. */
  memberships: { pharmacyId: string; name: string; role: PharmacyRole }[];
}

export async function getCurrentStaff(): Promise<CurrentStaff | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const requested = (await cookies()).get(PHARMACY_COOKIE)?.value ?? null;

  return systemDb(async (tx) => {
    // findMany, not findUnique: one login can be staff at several pharmacies.
    // Named columns rather than a bare select — this is the query that decides
    // who you are, and if it throws nobody can sign in at all, so a column
    // added to this model later must not be able to reach this line.
    const memberships = await tx.pharmacyStaff.findMany({
      where: { authUserId: user.id },
      select: {
        id: true,
        pharmacyId: true,
        role: true,
        email: true,
        displayName: true,
        createdAt: true,
        pharmacy: {
          select: { name: true, displayName: true, slug: true, status: true, vatRatePct: true },
        },
      },
    });

    // Authenticated with Supabase but not staff anywhere: treat as signed out
    // rather than as an error. That is what a removed membership looks like,
    // and it should send them to /login, not to a stack trace.
    if (memberships.length === 0) return null;

    const activeId = pickPharmacy(
      memberships.map((m) => ({
        pharmacyId: m.pharmacyId,
        createdAt: m.createdAt.toISOString(),
        active: m.pharmacy.status === "active",
      })),
      requested,
    );
    const staff = memberships.find((m) => m.pharmacyId === activeId) ?? memberships[0];

    return {
      authUserId: user.id,
      staffId: staff.id,
      pharmacyId: staff.pharmacyId,
      pharmacyName: staff.pharmacy.displayName ?? staff.pharmacy.name,
      pharmacySlug: staff.pharmacy.slug,
      pharmacyStatus: staff.pharmacy.status,
      vatRatePct: staff.pharmacy.vatRatePct,
      role: staff.role as PharmacyRole,
      email: staff.email,
      displayName: staff.displayName,
      memberships: memberships.map((m) => ({
        pharmacyId: m.pharmacyId,
        name: m.pharmacy.displayName ?? m.pharmacy.name,
        role: m.role as PharmacyRole,
      })),
    };
  });
}

/**
 * The same, but throws rather than returning null.
 *
 * Two separate strings, because they are two different situations and
 * conflating them is how a permissions bug gets reported as "it logged me out".
 */
export async function requireStaff(permission?: Permission): Promise<CurrentStaff> {
  const staff = await getCurrentStaff();
  if (!staff) throw new Error("UNAUTHENTICATED");
  if (permission && !can(staff.role, permission)) throw new Error("FORBIDDEN");
  return staff;
}
