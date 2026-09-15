import "server-only";
import { redirect } from "next/navigation";
import {
  can,
  requireCapability,
  defaultPermissionsOf,
  isPartnerPermission,
  type Capability,
  type PartnerPermission,
  type PartnerUserRole,
  isPartnerUserRole,
} from "@servd/core";
import { resolvePermissions } from "@/server/partners/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { systemDb } from "@/server/tenancy/scoped-db";
import { getImpersonation } from "@/server/hq/impersonate";

/**
 * Who is signed into the partner portal.
 *
 * TWO PATHS, ON PURPOSE. Until Phase A1 a partner WAS one Supabase user:
 * `partners.authUserId`, one row, one login. Seats now live in `partner_users`
 * with a role — but that column stays and still works, because breaking every
 * live session to normalise a column is not a trade worth making.
 *
 * So: look for a seat first, fall back to the legacy column. The migration
 * backfills an `admin` seat for every partner that had a login, so in practice
 * the first branch answers and the second is the safety net for a database
 * where `add-partner-portal.sql` has not been run yet. That is not hypothetical
 * — this repository has run ahead of its own migrations before, and a portal
 * that 500s on a missing table is worse than one that logs people in.
 *
 * A legacy login resolves as `admin`, which is what it always effectively was.
 */
export interface CurrentPartner {
  id: string;
  name: string;
  email: string;
  status: string;
  tier: string;
  /// 0 for every legacy reseller, 70 for a CANVEXIA operator. Selected because
  /// the dashboard has to tell the two apart: see the note in partner/page.tsx.
  revenueSharePct: number;

  /** The signed-in seat. */
  user: {
    /** Null for a legacy login that has no `partner_users` row yet. */
    id: string | null;
    email: string;
    name: string | null;
    role: PartnerUserRole;
  };

  /**
   * Set when this is HQ looking, not the partner.
   *
   * The session is READ-ONLY and `requireWritablePartner()` below is what makes
   * that true. This field exists so the portal can say so on every screen: a
   * banner is the difference between an operator seeing HQ in their audit log
   * and an operator discovering it.
   */
  impersonatedBy?: { hqAdminEmail: string; expiresAt: Date };

  /**
   * What this seat may do, resolved for THIS REQUEST (A7).
   *
   * Defaults from `packages/core` with this partner's overrides applied. Not
   * cached in the session and not in the token, which is what makes a role or
   * grid change take effect on the next request with nothing to invalidate.
   */
  permissions: Set<PartnerPermission>;
}

/** Does this seat hold a permission? For rendering; not a gate on its own. */
export function partnerAllows(
  partner: CurrentPartner,
  permission: PartnerPermission,
): boolean {
  return partner.permissions.has(permission);
}

/** Does this seat hold a capability? For rendering; not a gate on its own. */
export function partnerCan(partner: CurrentPartner, capability: Capability): boolean {
  return can(partner.user.role, capability);
}

/**
 * Throwing gate, for server actions.
 *
 * Separate from `partnerCan` because the failure mode of a boolean is somebody
 * writing `partnerCan(p, "revenue.pricing")` without the `if` — which reads like
 * a guard and is not one.
 */
export function requirePartnerCapability(
  partner: CurrentPartner,
  capability: Capability,
): void {
  requireCapability(partner.user.role, capability);
}

export async function getCurrentPartner(): Promise<CurrentPartner | null> {
  // --- HQ, looking ----------------------------------------------------------
  //
  // Checked FIRST, and it deliberately does not consult Supabase Auth: the HQ
  // admin is signed in as an HQ user, not as a partner, so the paths below
  // would find nothing for them. Every property of the grant — which partner,
  // whether it has expired, whether it was revoked — is read from the row, not
  // from the cookie. See server/hq/impersonate.ts.
  const viewing = await getImpersonation();
  if (viewing) {
    const partner = await systemDb((tx) =>
      tx.partner.findUnique({
        where: { id: viewing.partnerId },
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          tier: true,
          revenueSharePct: true,
        },
      }),
    );
    if (!partner) return null;
    return {
      ...partner,
      // `admin`, so HQ sees every screen the partner's own admin sees — which
      // is the point of looking. It grants no WRITE anywhere, because every
      // action refuses an impersonated session before it consults a capability.
      user: { id: null, email: viewing.hqAdminEmail, name: "CANVEXIA HQ", role: "admin" },
      // The admin DEFAULTS, not this partner's overrides. HQ is looking at
      // every screen the partner's own admin can see, which is the point; an
      // operator who had hidden a screen from their own admins would otherwise
      // hide it from the person investigating their account. It grants no
      // write: every action refuses an impersonated session first.
      permissions: new Set(defaultPermissionsOf("admin")),
      impersonatedBy: {
        hqAdminEmail: viewing.hqAdminEmail,
        expiresAt: viewing.expiresAt,
      },
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // --- The seat path ---------------------------------------------------------
  try {
    const seat = await systemDb((tx) =>
      tx.partnerUser.findUnique({
        where: { authUserId: user.id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          partner: {
            select: {
              id: true,
              name: true,
              email: true,
              status: true,
              tier: true,
              revenueSharePct: true,
            },
          },
        },
      }),
    );

    // A deactivated seat is kept — the audit log names an actor, and deleting
    // the row makes past actions anonymous — but it does not sign in.
    if (seat && seat.status === "active" && isPartnerUserRole(seat.role)) {
      return {
        ...seat.partner,
        user: { id: seat.id, email: seat.email, name: seat.name, role: seat.role },
        permissions: await resolvePermissions(seat.partner.id, seat.role),
      };
    }
    if (seat) return null;
  } catch {
    // partner_users not migrated yet. Fall through rather than 500.
  }

  // --- The legacy path -------------------------------------------------------
  try {
    const partner = await systemDb((tx) =>
      tx.partner.findUnique({
        where: { authUserId: user.id },
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          tier: true,
          revenueSharePct: true,
        },
      }),
    );
    if (!partner) return null;
    return {
      ...partner,
      user: { id: null, email: partner.email, name: partner.name, role: "admin" },
      // A legacy login has no `partner_users` row, so it has no seat for the
      // grid to be about. It resolves through the partner's own admin
      // overrides anyway: the account IS the admin, and reading the defaults
      // instead would let a legacy login keep a screen its own grid turned off.
      permissions: await resolvePermissions(partner.id, "admin"),
    };
  } catch {
    return null;
  }
}

/** Gate a partner-portal page. Redirects to login when not a partner. */
export async function requirePartnerPage(): Promise<CurrentPartner> {
  const partner = await getCurrentPartner();
  if (!partner) redirect("/partner/login");
  return partner;
}

/**
 * Gate a page on a capability as well as a session.
 *
 * Redirects to the portal home rather than to login: a salesperson who guesses
 * /partner/revenue is signed in correctly and simply does not have it, and
 * bouncing them to a login form would read as a broken session.
 */
export async function requirePartnerPageWith(
  capability: Capability,
): Promise<CurrentPartner> {
  const partner = await requirePartnerPage();
  if (!can(partner.user.role, capability)) redirect("/partner");
  return partner;
}

/**
 * The actor for a partner server action: signed in, approved, holds the
 * capability, and NOT HQ looking over their shoulder.
 *
 * ONE chokepoint, because the alternative is seven action files each
 * remembering to refuse an impersonated session — and the failure mode of
 * remembering is HQ writing to an operator's pipeline from a read-only session
 * that said it was read-only.
 *
 * Returns null rather than throwing: every caller already renders a message,
 * and a thrown error mid-submit reads as a broken form.
 */
export async function requireWritablePartner(
  /**
   * A7 PERMISSION or a legacy capability.
   *
   * Both, during the changeover, and the union is deliberate rather than a
   * migration left half-done: `packages/core`'s 14 capabilities are still what
   * the merchant-side code and six shipped action files name, and rewriting
   * them all in the same commit that introduces the grid would mean one change
   * nobody can review. A permission is resolved against this seat's grid; a
   * capability falls back to the fixed matrix.
   */
  need?: PartnerPermission | Capability,
): Promise<{
  partnerId: string;
  email: string;
  partner: CurrentPartner;
  /** The seat's own id, for the A7 tables. Null on a legacy login. */
  userId: string | null;
} | null> {
  const partner = await getCurrentPartner();
  if (!partner || partner.status !== "approved") return null;
  // Before the permission check, not after. An impersonated session resolves as
  // `admin` with the admin defaults, so asking about the permission first would
  // answer "yes".
  if (partner.impersonatedBy) return null;

  if (need) {
    if (isPartnerPermission(need)) {
      if (!partner.permissions.has(need)) return null;
    } else {
      try {
        requireCapability(partner.user.role, need);
      } catch {
        return null;
      }
    }
  }
  return {
    partnerId: partner.id,
    email: partner.user.email,
    partner,
    userId: partner.user.id,
  };
}

/**
 * The seat-scoped read gate: the partner id AND the seat id, for `partnerDb`.
 *
 * Separate from `requireWritablePartner` because reads are not writes — an HQ
 * "view as" session must still be able to LOOK at a staff screen, and the write
 * gate refuses it outright. Returns a null seat for an impersonated session,
 * which reads the staff tables as empty rather than as somebody's GPS trail.
 */
export async function partnerReadScope(): Promise<{
  partnerId: string;
  userId: string | null;
  partner: CurrentPartner;
} | null> {
  const partner = await getCurrentPartner();
  if (!partner || partner.status !== "approved") return null;
  return { partnerId: partner.id, userId: partner.user.id, partner };
}
