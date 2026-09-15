import { type PartnerUserRole } from "./roles";

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
