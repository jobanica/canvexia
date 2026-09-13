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
  "hq_admin",
  "partner_admin",
  "partner_staff",
  "merchant_owner",
  "merchant_staff",
] as const;

export type Role = (typeof ROLES)[number];

/** Which level of the hierarchy a role belongs to. */
export type RoleLevel = "hq" | "partner" | "merchant";

const LEVEL: Record<Role, RoleLevel> = {
  hq_admin: "hq",
  partner_admin: "partner",
  partner_staff: "partner",
  merchant_owner: "merchant",
  merchant_staff: "merchant",
};

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
