import "server-only";
import {
  PARTNER_PERMISSIONS,
  defaultPermissionsOf,
  isPartnerPermission,
  isGridLocked,
  type PartnerPermission,
  type PartnerUserRole,
} from "@servd/core";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * What one seat may do: the defaults from `packages/core`, with this partner's
 * overrides applied on top.
 *
 * DEFAULTS IN CODE, OVERRIDES IN THE TABLE, and a missing row means "default".
 * The alternative — seed 116 rows per partner and read only the table — fails
 * in a specific and unpleasant way: adding a thirtieth permission key in a
 * later release denies it to every partner seeded before the key existed, and
 * the symptom is a screen that silently vanished for a reason nobody can find.
 *
 * Resolved ONCE PER REQUEST in `getCurrentPartner()`, never cached in the
 * session or the token. That is what makes "role changes take effect on the
 * next request" true rather than aspirational — there is nothing to invalidate.
 */
export async function resolvePermissions(
  partnerId: string,
  role: PartnerUserRole,
): Promise<Set<PartnerPermission>> {
  const out = new Set<PartnerPermission>(defaultPermissionsOf(role));

  let overrides: { permission: string; allowed: boolean }[] = [];
  try {
    overrides = await systemDb((tx) =>
      tx.partnerRolePermission.findMany({
        where: { partnerId, role },
        select: { permission: true, allowed: true },
      }),
    );
  } catch {
    // partner_role_permissions not migrated yet. The defaults are the answer,
    // which is exactly what every partner had before A7 — a portal that 500s on
    // a missing table is worse than one running on last release's rules.
    return out;
  }

  for (const o of overrides) {
    if (!isPartnerPermission(o.permission)) continue; // a key this release does not know
    if (o.allowed) out.add(o.permission);
    else out.delete(o.permission);
  }
  return out;
}

/**
 * The whole grid for the permission screen: every key × every role, with where
 * each answer came from.
 *
 * `source` is what makes the screen honest. A toggle that is on because nobody
 * has touched it and a toggle that is on because somebody turned it on are
 * different facts, and only the second one survives a change to the defaults.
 */
export interface GridCell {
  role: PartnerUserRole;
  permission: PartnerPermission;
  allowed: boolean;
  source: "default" | "override";
  locked: boolean;
}

export async function permissionGrid(
  partnerId: string,
  roles: readonly PartnerUserRole[],
): Promise<GridCell[]> {
  let overrides: { role: string; permission: string; allowed: boolean }[] = [];
  try {
    overrides = await systemDb((tx) =>
      tx.partnerRolePermission.findMany({
        where: { partnerId },
        select: { role: true, permission: true, allowed: true },
      }),
    );
  } catch {
    overrides = [];
  }
  const byKey = new Map(overrides.map((o) => [`${o.role}:${o.permission}`, o.allowed]));

  const cells: GridCell[] = [];
  for (const role of roles) {
    const defaults = new Set(defaultPermissionsOf(role));
    for (const permission of PARTNER_PERMISSIONS) {
      const override = byKey.get(`${role}:${permission}`);
      cells.push({
        role,
        permission,
        allowed: override ?? defaults.has(permission),
        source: override === undefined ? "default" : "override",
        locked: isGridLocked(role, permission),
      });
    }
  }
  return cells;
}

/**
 * Write one cell.
 *
 * Always an UPSERT of an override row, never a delete-back-to-default, even
 * when the new value happens to equal the default. Deleting would make the
 * screen lie the next time the defaults change: a partner who deliberately
 * turned something on in March would find it off in June because the shipped
 * default moved under them.
 */
export async function setPermission(
  partnerId: string,
  role: PartnerUserRole,
  permission: PartnerPermission,
  allowed: boolean,
  updatedBy: string,
): Promise<void> {
  await systemDb((tx) =>
    tx.partnerRolePermission.upsert({
      where: { partnerId_role_permission: { partnerId, role, permission } },
      create: { partnerId, role, permission, allowed, updatedBy },
      update: { allowed, updatedBy },
    }),
  );
}
