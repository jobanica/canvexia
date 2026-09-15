"use server";

import { revalidatePath } from "next/cache";
import {
  PARTNER_USER_ROLES,
  isGridLocked,
  isPartnerPermission,
  isPartnerUserRole,
  permissionDefault,
  type PartnerPermission,
  type PartnerUserRole,
} from "@servd/core";
import { requireWritablePartner } from "@/server/partners/auth";
import { setPermission } from "@/server/partners/permissions";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writeSeatAudit } from "@/server/audit/log";

export type GridState = { ok?: boolean; error?: string } | null;

/**
 * Toggle one cell of the permission grid.
 *
 * `team.permissions` only, and that key is LOCKED on the admin row — see
 * `isGridLocked`. An admin who could take `team.permissions` away from `admin`
 * would leave the screen that grants access unreachable from inside it, and
 * the only way back would be hand-run SQL. The same refusal `/hq/team` makes
 * about the last super admin, for the same reason.
 *
 * Audited on every flip. This is the screen that decides what everyone else in
 * the company can do; "who turned off the revenue for ops last March" is
 * exactly the question an audit log exists to answer.
 */
export async function setPermissionAction(formData: FormData): Promise<void> {
  const who = await requireWritablePartner("team.permissions");
  if (!who) return;

  const role = String(formData.get("role") ?? "");
  const permission = String(formData.get("permission") ?? "");
  if (!isPartnerUserRole(role) || !isPartnerPermission(permission)) return;

  const allowed = String(formData.get("allowed") ?? "") === "true";

  // Checked on the server, not only hidden in the UI. The grid renders these
  // cells as fixed, and a hidden control stops nobody.
  if (isGridLocked(role, permission)) return;

  await setPermission(who.partnerId, role, permission, allowed, who.email);

  await systemDb((tx) =>
    writeSeatAudit(tx, who, {
      action: "partner.permission_changed",
      entityType: "partner_role_permission",
      entityId: `${role}:${permission}`,
      after: { role, permission, allowed },
    }),
  );

  revalidatePath("/partner/team/permissions");
  revalidatePath("/partner");
}

/**
 * Put one role's whole row back to the shipped defaults.
 *
 * Deletes the override rows rather than writing the default value into them:
 * "reset" should mean "follow the product", so a partner who resets in March
 * and sees the default change in June gets the new default. That is the
 * opposite of what a single toggle does, and deliberately — a deliberate ON is
 * a decision, a reset is a withdrawal of one.
 */
export async function resetRoleDefaultsAction(formData: FormData): Promise<void> {
  const who = await requireWritablePartner("team.permissions");
  if (!who) return;
  const role = String(formData.get("role") ?? "");
  if (!isPartnerUserRole(role)) return;

  await systemDb(async (tx) => {
    const before = await tx.partnerRolePermission.findMany({
      where: { partnerId: who.partnerId, role },
      select: { permission: true, allowed: true },
    });
    await tx.partnerRolePermission.deleteMany({ where: { partnerId: who.partnerId, role } });
    await writeSeatAudit(tx, who, {
      action: "partner.permissions_reset",
      entityType: "partner_role_permission",
      entityId: role,
      before,
      after: { role, reset: true },
    });
  });

  revalidatePath("/partner/team/permissions");
  revalidatePath("/partner");
}

/**
 * How many seats each role has, for the grid's header.
 *
 * Renders as "3 people" under each column, which is the context that makes the
 * screen safe to use: turning something off for `sales` when nobody can see how
 * many salespeople there are is a change made blind.
 */
export async function seatCountsByRole(
  partnerId: string,
): Promise<Record<PartnerUserRole, number>> {
  const out = Object.fromEntries(PARTNER_USER_ROLES.map((r) => [r, 0])) as Record<
    PartnerUserRole,
    number
  >;
  try {
    const rows = await systemDb((tx) =>
      tx.partnerUser.groupBy({
        by: ["role"],
        where: { partnerId, status: "active" },
        _count: { _all: true },
      }),
    );
    for (const r of rows) {
      if (isPartnerUserRole(r.role)) out[r.role] = r._count._all;
    }
  } catch {
    /* partner_users not migrated — zeroes are honest */
  }
  return out;
}

/** Re-exported so the page can render a cell's origin without a second import. */
export async function defaultFor(
  role: PartnerUserRole,
  permission: PartnerPermission,
): Promise<boolean> {
  return permissionDefault(role, permission);
}
