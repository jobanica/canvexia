import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { systemDb } from "@/server/tenancy/scoped-db";
import { pickBranch, BRANCH_COOKIE } from "@/lib/tenancy/active-branch";
import type { Prisma, StaffRole } from "@prisma/client";
import { parseAdminRole, type AdminRole } from "@/lib/platform/admin-scope";
import { isExpired } from "@/lib/preview-login/expiry";

/**
 * Resolves the currently-authenticated principal from the Supabase session.
 *
 * Returns one of:
 *   - { kind: "staff",  restaurantId, role, ... }  — a restaurant's staff/admin
 *   - { kind: "super" }                            — the platform super-admin (you)
 *   - null                                         — not logged in
 *
 * CRITICAL: restaurantId is derived ONLY from the trusted session here, never
 * from the URL or request body. Everything downstream scopes to this value.
 */
export type CurrentUser =
  | {
      kind: "staff";
      authUserId: string;
      staffUserId: string;
      restaurantId: string;
      role: StaffRole;
      email: string;
      /**
       * How many restaurants this login is staff at. One for almost everyone;
       * more for an owner running branches, which is the only case where the
       * dashboard shows a branch switcher.
       */
      branchCount: number;
    }
  | { kind: "super"; authUserId: string; email: string; role: AdminRole }
  | null;

/**
 * The admin's back-office scope, read separately and best-effort.
 *
 * Deliberately its own query. `role` ships as a hand-run migration, and a
 * database that hasn't had it must still let the founder log in — so a failure
 * here falls back to "owner", which is what every admin row meant before the
 * column existed. Restricting on a failed read would lock the owner out of
 * their own back office at the worst possible moment.
 */
async function readAdminRole(
  tx: Prisma.TransactionClient,
  authUserId: string,
): Promise<AdminRole> {
  try {
    const row = await tx.platformAdmin.findUnique({
      where: { authUserId },
      select: { role: true },
    });
    return parseAdminRole(row?.role);
  } catch {
    return "owner";
  }
}

/**
 * Remove memberships whose temporary demo login has lapsed.
 *
 * The expiry is read in its own query, so a database that hasn't run the
 * migration still logs everyone in. That falls open, which is safe here for a
 * specific reason rather than by hope: without the column no preview login can
 * ever have been created, so on such a database every staff row is a permanent
 * account and there is nothing to expire. Where the column does exist, this is
 * the check that enforces it, on every request.
 */
async function withoutExpiredPreviews<T extends { id: string }>(
  tx: Prisma.TransactionClient,
  rows: T[],
): Promise<T[]> {
  if (rows.length === 0) return rows;
  let expiries: { id: string; previewExpiresAt: Date | null }[];
  try {
    expiries = await tx.staffUser.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      select: { id: true, previewExpiresAt: true },
    });
  } catch {
    return rows; // column not migrated — no preview login can exist yet
  }
  const now = new Date();
  const dead = new Set(
    expiries.filter((e) => isExpired(e.previewExpiresAt, now)).map((e) => e.id),
  );
  return dead.size === 0 ? rows : rows.filter((r) => !dead.has(r.id));
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Look up the profile rows in a trusted (super-admin) context: we're resolving
  // identity itself, so we can't yet be tenant-scoped.
  return systemDb(async (tx) => {
    // Named columns, not a bare findUnique. This is the query that decides who
    // you are — if it throws, nobody can log in at all — and Prisma returns
    // every scalar when there is no select, so a column added to this model
    // later must not be able to reach this line.
    const admin = await tx.platformAdmin.findUnique({
      where: { authUserId: user.id },
      select: { email: true },
    });
    if (admin) {
      return {
        kind: "super",
        authUserId: user.id,
        email: admin.email,
        role: await readAdminRole(tx, user.id),
      };
    }

    // findMany, not findUnique: one login can be staff at several restaurants
    // (an owner with branches). Which one they're looking at comes from the
    // branch cookie, checked against these rows — the cookie is a request from
    // the browser, so membership is verified here rather than trusted.
    const allMemberships = await tx.staffUser.findMany({
      where: { authUserId: user.id },
      select: {
        id: true,
        restaurantId: true,
        role: true,
        email: true,
        createdAt: true,
        // Only a LIVE branch can be worked in — an unactivated one has no
        // ordering and nothing to run, so a stale cookie pointing at one must
        // not strand the owner in a dashboard that can't do anything.
        restaurant: { select: { status: true } },
      },
    });

    // Drop any membership whose temporary demo login has run out. Enforced on
    // every request rather than left to a cleanup job: a login that keeps
    // working because a cron didn't run is not expired in any useful sense.
    const memberships = await withoutExpiredPreviews(tx, allMemberships);

    if (memberships.length > 0) {
      const requested = (await cookies()).get(BRANCH_COOKIE)?.value ?? null;
      const activeId = pickBranch(
        memberships.map((m) => ({
          restaurantId: m.restaurantId,
          createdAt: m.createdAt.toISOString(),
          active: m.restaurant.status === "active",
        })),
        requested,
      );
      const staff = memberships.find((m) => m.restaurantId === activeId) ?? memberships[0];
      return {
        kind: "staff",
        authUserId: user.id,
        staffUserId: staff.id,
        restaurantId: staff.restaurantId,
        role: staff.role,
        email: staff.email,
        branchCount: memberships.length,
      };
    }

    // Authenticated with Supabase but no Servd profile — treat as logged out.
    return null;
  });
}

/** Throws unless a staff/admin user is logged in. Returns the user. */
export async function requireStaff(allowed?: StaffRole[]): Promise<
  Extract<CurrentUser, { kind: "staff" }>
> {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff") {
    throw new Error("UNAUTHORIZED");
  }
  if (allowed && !allowed.includes(user.role)) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

/** Throws unless the platform super-admin is logged in. */
export async function requireSuperAdmin(): Promise<
  Extract<CurrentUser, { kind: "super" }>
> {
  const user = await getCurrentUser();
  if (!user || user.kind !== "super") {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}
