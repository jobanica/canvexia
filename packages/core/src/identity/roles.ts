/**
 * Who someone is, across the whole CANVEXIA hierarchy: HQ → partner → merchant.
 *
 * One Supabase identity can hold several of these at once — an HQ admin who also
 * owns a test merchant, a partner admin who runs one of their own shops — so a
 * role is a MEMBERSHIP, not a column on a user. Modelling it as a single field
 * is the mistake that makes "log in as my own merchant to reproduce this" turn
 * into a second account and a password nobody writes down.
 *
 * This file is the vocabulary only. It deliberately does not know how a
 * membership is stored or looked up: Servd today has two separate identity
 * tables (PlatformAdmin for HQ, StaffUser for merchants, Partner.authUserId for
 * partners), and unifying those is its own migration with live sessions in it.
 * Phase 2 and 3 map those onto these names; nothing here forces that to happen
 * in one step.
 */

export const ROLES = [
  /**
   * HQ, in two levels.
   *
   * `hq_admin` is KEPT for the same reason `partner_staff` below is kept: it is
   * part of a shipped exported type and nothing is gained by breaking anything
   * narrowing on `Role`. It reads as a synonym for `hq_super_admin`, which is
   * what it has always meant — until now HQ was one binary door.
   */
  "hq_super_admin",
  "hq_ops",
  "hq_admin",
  "partner_admin",
  /**
   * The operations manager: everything an admin has except the money, the
   * brand, and the ability to change what anyone is allowed to do.
   *
   * Added in A7. It is the role a partner's business actually needs and the
   * flat three did not have — somebody who runs the team and the merchant book
   * without seeing the revenue share or editing the permission grid.
   */
  "partner_ops_manager",
  "partner_sales",
  "partner_support",
  /**
   * KEPT, not removed and not migrated.
   *
   * The brief said "migrate existing partner_staff → partner_sales". There is
   * nothing to migrate: this name has only ever been a string in this union —
   * no table, no column, no rows. What it IS, is part of a shipped exported
   * type, so deleting it is a breaking change to anything narrowing on `Role`
   * for no gain.
   *
   * It is a synonym for `partner_sales` and `PARTNER_USER_ROLES` below — the
   * set the database actually stores — deliberately excludes it, so nothing new
   * can be created holding it.
   */
  "partner_staff",
  "merchant_owner",
  "merchant_staff",
] as const;

export type Role = (typeof ROLES)[number];

/** Which level of the hierarchy a role belongs to. */
export type RoleLevel = "hq" | "partner" | "merchant";

const LEVEL: Record<Role, RoleLevel> = {
  hq_super_admin: "hq",
  hq_ops: "hq",
  hq_admin: "hq",
  partner_admin: "partner",
  partner_ops_manager: "partner",
  partner_sales: "partner",
  partner_support: "partner",
  partner_staff: "partner",
  merchant_owner: "merchant",
  merchant_staff: "merchant",
};

/**
 * What `partner_users.role` may contain.
 *
 * Short names, because the row already knows it belongs to a partner — storing
 * "partner_admin" on a table called partner_users is the prefix twice. A CHECK
 * constraint in the database enforces exactly this set.
 *
 * `partner_staff` is NOT here: it is the legacy synonym above and nothing new
 * should be written holding it.
 */
export const PARTNER_USER_ROLES = ["admin", "ops_manager", "sales", "support"] as const;

/**
 * Admin is NOT renamed to `partner_admin`, and the brief's
 * `partner_sales → sales` migration is a no-op.
 *
 * There is nothing named `partner_sales` in this database to rename: the CHECK
 * constraint has said `admin | sales | support` since `add-partner-portal.sql`.
 * What A7 adds is the fourth value. Renaming `admin` would touch every seat
 * row, the CHECK, `parseRole`, six action files and the HQ console, for a
 * column that already knows it belongs to a partner.
 */

/**
 * What `platform_admins.role` may contain.
 *
 * NULL is the third value and means `super_admin`. That is not an oversight to
 * tidy up later: every HQ row that existed before this file has NULL there, and
 * a backfill that rewrote them would be a migration whose only purpose is to
 * make a column look neater. `parseHqRole` below is the one place that knows.
 *
 * Short names, because the row already knows it is an HQ row — storing
 * "hq_super_admin" on a table called platform_admins is the prefix twice.
 */
export const HQ_USER_ROLES = ["super_admin", "ops"] as const;

export type HqUserRole = (typeof HQ_USER_ROLES)[number];

export function isHqUserRole(value: string): value is HqUserRole {
  return (HQ_USER_ROLES as readonly string[]).includes(value);
}

/**
 * The stored value, widened to a role.
 *
 * Fails closed in one direction only: an unrecognised string is NOT treated as
 * `ops`, because the column's existing meaning for "unset" is full access and
 * silently demoting the founder mid-session is its own outage. A typo is caught
 * by the CHECK constraint on the column, which is where it belongs.
 */
export function parseHqRole(raw: string | null | undefined): HqUserRole {
  return raw === "ops" ? "ops" : "super_admin";
}

/** The stored short name, widened to the platform-wide vocabulary. */
export function toHqRole(role: HqUserRole): Role {
  return role === "ops" ? "hq_ops" : "hq_super_admin";
}

export type PartnerUserRole = (typeof PARTNER_USER_ROLES)[number];

export function isPartnerUserRole(value: string): value is PartnerUserRole {
  return (PARTNER_USER_ROLES as readonly string[]).includes(value);
}

/** The stored short name, widened to the platform-wide vocabulary. */
export function toRole(role: PartnerUserRole): Role {
  return {
    admin: "partner_admin",
    ops_manager: "partner_ops_manager",
    sales: "partner_sales",
    support: "partner_support",
  }[role] as Role;
}

/**
 * The stored value, widened to a seat role.
 *
 * Fails closed, unlike `parseHqRole`: an unrecognised string becomes `sales`,
 * the least privileged role that can still do the job it was hired for. The
 * opposite default would turn a typo in a column into an admin.
 */
export function parseRole(raw: string | null | undefined): PartnerUserRole {
  return raw && isPartnerUserRole(raw) ? raw : "sales";
}

export function levelOf(role: Role): RoleLevel {
  return LEVEL[role];
}

export function isHqRole(role: Role): boolean {
  return LEVEL[role] === "hq";
}

export function isPartnerRole(role: Role): boolean {
  return LEVEL[role] === "partner";
}

export function isMerchantRole(role: Role): boolean {
  return LEVEL[role] === "merchant";
}

/**
 * One thing an identity is allowed to act as.
 *
 * `partnerId` is present for merchant memberships too, and that is the point:
 * it is what lets a partner-scoped screen show a merchant without a second
 * lookup, and what a future audit row records as the actor's context.
 */
export interface Membership {
  role: Role;
  /** Set for partner and merchant roles; null for HQ. */
  partnerId: string | null;
  /** Set for merchant roles only. */
  merchantId: string | null;
}

/**
 * The scope a request should run under, given everything an identity can do.
 *
 * Most specific wins, and the order is not arbitrary: a person holding both an
 * HQ role and a merchant role is an operator debugging a merchant, and running
 * them as HQ would silently hand them a super-admin context — which bypasses
 * every tenant policy — for a screen that only needed one restaurant. Narrow by
 * default; widening is an explicit act.
 */
export function resolveScope(
  memberships: readonly Membership[],
  prefer?: { merchantId?: string; partnerId?: string },
): { level: RoleLevel; partnerId: string | null; merchantId: string | null } | null {
  if (memberships.length === 0) return null;

  if (prefer?.merchantId) {
    const m = memberships.find(
      (x) => isMerchantRole(x.role) && x.merchantId === prefer.merchantId,
    );
    if (m) return { level: "merchant", partnerId: m.partnerId, merchantId: m.merchantId };
  }
  if (prefer?.partnerId) {
    const p = memberships.find(
      (x) => isPartnerRole(x.role) && x.partnerId === prefer.partnerId,
    );
    if (p) return { level: "partner", partnerId: p.partnerId, merchantId: null };
  }

  const merchant = memberships.find((x) => isMerchantRole(x.role));
  if (merchant) {
    return { level: "merchant", partnerId: merchant.partnerId, merchantId: merchant.merchantId };
  }
  const partner = memberships.find((x) => isPartnerRole(x.role));
  if (partner) {
    return { level: "partner", partnerId: partner.partnerId, merchantId: null };
  }
  return { level: "hq", partnerId: null, merchantId: null };
}
