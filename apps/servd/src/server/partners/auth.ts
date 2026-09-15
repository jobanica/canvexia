import "server-only";
import { redirect } from "next/navigation";
import {
  can,
  requireCapability,
  type Capability,
  type PartnerUserRole,
  isPartnerUserRole,
} from "@servd/core";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { systemDb } from "@/server/tenancy/scoped-db";

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
