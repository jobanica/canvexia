import { type HqUserRole, type PartnerUserRole } from "./roles";

/**
 * What each partner seat may do.
 *
 * ONE table, consulted by both the UI and the server. The brief asks for the UI
 * to hide rather than disable, and it is right: a disabled "Revenue" tab tells a
 * salesperson exactly what they are missing and invites a URL guess. Hiding is
 * a courtesy; the RLS policy and the server checks below are what make the
 * guess fail.
 *
 * Capabilities are named for the ACTION, not the screen. "revenue.read" survives
 * the revenue page being split in two; "canSeeRevenuePage" does not.
 */
export const CAPABILITIES = [
  "pipeline.read",
  "pipeline.write",
  "merchants.read",
  "merchants.create",
  "merchants.note",
  /** Change plan, extend trial, suspend, reactivate, mark invoice paid. */
  "merchants.manage",
  /**
   * Open a merchant's own app in an impersonation session.
   *
   * The single most dangerous capability in the portal: it puts one tenant
   * inside another tenant's data by design. Support has it because support is
   * what it is for. Sales does not — a salesperson has no reason to be inside a
   * merchant's till.
   */
  "merchants.impersonate",
  "revenue.read",
  "revenue.pricing",
  "brand.write",
  "domains.write",
  "team.read",
  "team.write",
  "settings.write",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const MATRIX: Record<PartnerUserRole, readonly Capability[]> = {
  admin: CAPABILITIES,

  // Sales works the pipeline and opens accounts. No money, no brand, no team —
  // and deliberately no impersonation.
  sales: [
    "pipeline.read",
    "pipeline.write",
    "merchants.read",
    "merchants.create",
    "merchants.note",
  ],

  // Support answers for merchants that already exist. It can get inside one to
  // reproduce a problem, and cannot change what anybody is charged.
  support: ["merchants.read", "merchants.note", "merchants.impersonate", "pipeline.read"],
};

export function can(role: PartnerUserRole, capability: Capability): boolean {
  return MATRIX[role].includes(capability);
}

/** Every capability a role holds. For rendering a nav, not for a gate. */
export function capabilitiesOf(role: PartnerUserRole): readonly Capability[] {
  return MATRIX[role];
}

/**
 * Throwing form, for server actions.
 *
 * A separate function rather than a boolean everyone remembers to check: the
 * failure mode of `can()` is someone writing `can(role, "revenue.pricing")` and
 * forgetting the `if`, which reads as a guard and is not one.
 */
export function requireCapability(role: PartnerUserRole, capability: Capability): void {
  if (!can(role, capability)) {
    throw new Error("FORBIDDEN");
  }
}

// ----------------------------------------------------------------------------
// HQ
//
// A SECOND matrix rather than more rows in the one above, because the two
// vocabularies do not overlap and never should. `merchants.read` means "the
// merchants this partner owns"; an HQ screen reads every merchant there is.
// Merging them would produce one capability whose meaning depends on who is
// asking, which is the kind of thing that is right until it is catastrophically
// wrong.
//
// Named for the action, same rule as above.
// ----------------------------------------------------------------------------

export const HQ_CAPABILITIES = [
  "partners.read",
  "partners.write",
  /** Suspend, revoke exclusivity, reassign every merchant away. */
  "partners.suspend",
  "territories.write",
  "applications.write",
  "merchants.reassign",
  /** Change a plan's floor price, which re-prices other people's businesses. */
  "plans.floor",
  "products.write",
  /** Freeze a statement run, mark a payout sent or an invoice paid. */
  "billing.run",
  /** Credit, debit, refund, waiver — money out of CANVEXIA's pocket. */
  "billing.adjust",
  "hq.team",
  /**
   * Open a partner's portal in a read-only impersonation session.
   *
   * The HQ twin of `merchants.impersonate`, and the same warning applies twice
   * over: it puts HQ inside an operator's own console. Super admin only, and
   * the session it grants cannot write — see server/hq/impersonate.ts.
   */
  "hq.impersonate",
  "announcements.write",
  "audit.read",
] as const;

export type HqCapability = (typeof HQ_CAPABILITIES)[number];

/**
 * The brief names four things ops may not do: billing adjustments, plan-floor
 * changes, partner suspension/revocation, and HQ team management. Those four,
 * plus impersonation — which the brief does not list because the flow did not
 * exist when it was written, and which is plainly in the same class.
 */
const HQ_DENIED_TO_OPS: readonly HqCapability[] = [
  "partners.suspend",
  "plans.floor",
  "billing.adjust",
  "hq.team",
  "hq.impersonate",
];

const HQ_MATRIX: Record<HqUserRole, readonly HqCapability[]> = {
  super_admin: HQ_CAPABILITIES,
  ops: HQ_CAPABILITIES.filter((c) => !HQ_DENIED_TO_OPS.includes(c)),
};

export function hqCan(role: HqUserRole, capability: HqCapability): boolean {
  return HQ_MATRIX[role].includes(capability);
}

/** Every capability an HQ role holds. For rendering a nav, not for a gate. */
export function hqCapabilitiesOf(role: HqUserRole): readonly HqCapability[] {
  return HQ_MATRIX[role];
}

/** Throwing form, for server actions. Same reasoning as requireCapability. */
export function requireHqCapability(role: HqUserRole, capability: HqCapability): void {
  if (!hqCan(role, capability)) {
    throw new Error("FORBIDDEN");
  }
}
