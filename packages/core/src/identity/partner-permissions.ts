import { type PartnerUserRole } from "./roles";

/**
 * What each partner SEAT may do, as editable permissions rather than a
 * hard-coded matrix.
 *
 * This replaces `identity/permissions.ts`'s 14 fixed capabilities for the
 * partner side. The difference that matters is not the longer list: it is that
 * a partner admin can now change the answer at `/team/permissions`, per
 * partner, without a release. The DEFAULTS live here; the overrides live in
 * `partner_role_permissions`.
 *
 * A MISSING ROW MEANS "USE THE DEFAULT", NOT "DENIED". That is the whole reason
 * the defaults stay in code. If absence meant denial, adding a thirtieth key in
 * a later release would silently deny it to every existing partner until
 * somebody remembered to run a backfill — and the symptom would be a screen
 * that vanished for reasons nobody could find.
 *
 * Keys are named for the ACTION, not the screen, for the same reason the old
 * matrix was: `revenue.view` survives the revenue page being split in two.
 */

/**
 * The 25 keys the A7 brief specifies.
 *
 * Reproduced exactly, in the brief's own order, so the grid at
 * /team/permissions and the table it was specified from can be read side by
 * side.
 */
const BRIEF_KEYS = [
  "overview.view",
  "overview.revenue_amounts",
  "merchants.view_all",
  "merchants.view_assigned",
  "merchants.create",
  "merchants.change_plan",
  "merchants.suspend",
  "merchants.login_as",
  "pipeline.view_all",
  "pipeline.view_own",
  "pipeline.assign",
  "revenue.view",
  "pricing.edit",
  "brand.edit",
  "team.manage",
  "team.permissions",
  "hr.view_all",
  "hr.view_own",
  "hr.set_targets",
  "attendance.checkin",
  "attendance.view_all",
  "commissions.view_own",
  "commissions.manage",
  "support.tickets",
  "settings.payout",
] as const;

/**
 * Four keys the brief does not list, added because a SHIPPED screen needs them.
 *
 * The brief's table is a clean design for the roles; it is not a complete
 * inventory of what the portal already does. Mapping the old 14 capabilities
 * onto the 25 above leaves four with nowhere to go, and dropping them would
 * remove working features rather than re-scope them:
 *
 * - `pipeline.write` — the brief has view_all, view_own and assign but nothing
 *   that ADDS a prospect. Without this a salesperson can look at the pipeline
 *   and never put anything in it, which is the job.
 * - `merchants.note` — the note field on a merchant, live since A2.
 * - `domains.write` — /partner/domains, live since A5.
 * - `settings.write` — /partner/settings as a whole. `settings.payout` in the
 *   brief is the payout CARD specifically; the page also carries notification
 *   preferences and the agreement.
 *
 * Their defaults reproduce the old matrix exactly, so A7 changes nobody's
 * access to a feature that already existed.
 */
const BRIDGE_KEYS = [
  "pipeline.write",
  "merchants.note",
  "domains.write",
  "settings.write",
] as const;

export const PARTNER_PERMISSIONS = [...BRIEF_KEYS, ...BRIDGE_KEYS] as const;

export type PartnerPermission = (typeof PARTNER_PERMISSIONS)[number];

export function isPartnerPermission(value: string): value is PartnerPermission {
  return (PARTNER_PERMISSIONS as readonly string[]).includes(value);
}

/** Grouped for the toggle grid, so 29 rows read as six sections. */
export const PERMISSION_GROUPS: { label: string; keys: PartnerPermission[] }[] = [
  { label: "Overview", keys: ["overview.view", "overview.revenue_amounts"] },
  {
    label: "Merchants",
    keys: [
      "merchants.view_all",
      "merchants.view_assigned",
      "merchants.create",
      "merchants.note",
      "merchants.change_plan",
      "merchants.suspend",
      "merchants.login_as",
    ],
  },
  {
    label: "Pipeline",
    keys: ["pipeline.view_all", "pipeline.view_own", "pipeline.write", "pipeline.assign"],
  },
  {
    label: "Money and brand",
    keys: ["revenue.view", "pricing.edit", "brand.edit", "domains.write", "settings.payout", "settings.write"],
  },
  { label: "Team", keys: ["team.manage", "team.permissions"] },
  {
    label: "People and field work",
    keys: [
      "hr.view_all",
      "hr.view_own",
      "hr.set_targets",
      "attendance.checkin",
      "attendance.view_all",
      "commissions.view_own",
      "commissions.manage",
      "support.tickets",
    ],
  },
];

export const PERMISSION_LABELS: Record<PartnerPermission, string> = {
  "overview.view": "See an overview",
  "overview.revenue_amounts": "See peso amounts on the overview",
  "merchants.view_all": "See every merchant",
  "merchants.view_assigned": "See merchants assigned to them",
  "merchants.create": "Open a merchant account",
  "merchants.note": "Write notes on a merchant",
  "merchants.change_plan": "Change a merchant's plan or trial",
  "merchants.suspend": "Suspend or reactivate a merchant",
  "merchants.login_as": "Open a merchant's own app",
  "pipeline.view_all": "See the whole pipeline",
  "pipeline.view_own": "See their own prospects",
  "pipeline.write": "Add and update prospects",
  "pipeline.assign": "Assign prospects to someone",
  "revenue.view": "See revenue and statements",
  "pricing.edit": "Set plan prices",
  "brand.edit": "Edit the brand",
  "domains.write": "Manage domains",
  "settings.payout": "Manage payout details",
  "settings.write": "Change settings",
  "team.manage": "Add, edit and deactivate seats",
  "team.permissions": "Edit this permission grid",
  "hr.view_all": "See every staff member's record",
  "hr.view_own": "See their own record",
  "hr.set_targets": "Set monthly targets",
  "attendance.checkin": "Check in and log visits",
  "attendance.view_all": "See everyone's attendance",
  "commissions.view_own": "See their own commission",
  "commissions.manage": "Set commission rules and mark paid",
  "support.tickets": "Work support tickets",
};

/**
 * `support.tickets` and `merchants.login_as` have NO screen in this repository.
 *
 * There is no ticket model, table or route anywhere, and the only impersonation
 * flow that exists is HQ → partner, not partner → merchant. Both keys are
 * seeded and editable because the grid should describe the shape of the job
 * rather than the shape of this release — but nothing renders a nav entry for
 * them, because a menu item that leads nowhere is worse than an absent one.
 */
export const PERMISSIONS_WITHOUT_SCREENS: PartnerPermission[] = [
  "support.tickets",
  "merchants.login_as",
];

const ALL = [...PARTNER_PERMISSIONS];

/**
 * The defaults, per role, exactly as the brief's table specifies them.
 *
 * `admin` gets everything — including the keys with no screen, so that when
 * one is built the partner who owns the account is not locked out of it.
 */
const DEFAULTS: Record<PartnerUserRole, readonly PartnerPermission[]> = {
  admin: ALL,

  // Runs the team and the merchant book. No money, no brand, no permission
  // grid: an ops manager who could edit the grid could grant themselves the
  // revenue, which would make three of their four denials decorative.
  ops_manager: [
    "overview.view",
    "merchants.view_all",
    "merchants.view_assigned",
    "merchants.create",
    "merchants.note",
    "merchants.change_plan",
    "merchants.suspend",
    "merchants.login_as",
    "pipeline.view_all",
    "pipeline.view_own",
    "pipeline.write",
    "pipeline.assign",
    "team.manage",
    "hr.view_all",
    "hr.view_own",
    "hr.set_targets",
    "attendance.checkin",
    "attendance.view_all",
    "commissions.view_own",
    "support.tickets",
  ],

  // Works the pipeline and opens accounts, sees only what is assigned to them.
  sales: [
    "overview.view",
    "merchants.view_assigned",
    "merchants.create",
    "merchants.note",
    "pipeline.view_own",
    "pipeline.write",
    "hr.view_own",
    "attendance.checkin",
    "commissions.view_own",
  ],

  // Answers for merchants that already exist. Can get inside one; cannot
  // change what anybody is charged and has no pipeline at all.
  support: [
    "overview.view",
    "merchants.view_all",
    "merchants.view_assigned",
    "merchants.note",
    "merchants.login_as",
    "hr.view_own",
    "attendance.checkin",
    "commissions.view_own",
    "support.tickets",
  ],
};

/** The default answer for one role and key, before any partner's overrides. */
export function permissionDefault(
  role: PartnerUserRole,
  permission: PartnerPermission,
): boolean {
  return DEFAULTS[role].includes(permission);
}

/** Every default a role holds. For seeding and for rendering the grid. */
export function defaultPermissionsOf(role: PartnerUserRole): readonly PartnerPermission[] {
  return DEFAULTS[role];
}

/**
 * Two rules the grid cannot express, and must not be able to.
 *
 * The brief writes ops_manager's team permission as "✓ (not admins)". That is
 * not a permission — it is a constraint on the OBJECT of the action, and there
 * is no key that could hold it. It is enforced in `team-actions.ts`.
 *
 * The second is the grid's own: an admin may not remove `team.permissions` or
 * `team.manage` from the `admin` role. Both would leave the screen that grants
 * access unreachable from inside it, and the only way back would be hand-run
 * SQL — the same refusal `/hq/team` makes about the last super admin.
 */
export const GRID_LOCKED: { role: PartnerUserRole; permission: PartnerPermission }[] = [
  { role: "admin", permission: "team.permissions" },
  { role: "admin", permission: "team.manage" },
];

export function isGridLocked(role: PartnerUserRole, permission: PartnerPermission): boolean {
  return GRID_LOCKED.some((l) => l.role === role && l.permission === permission);
}

/** May an ops_manager act on a seat holding this role? */
export function canManageSeatRole(
  actor: PartnerUserRole,
  target: PartnerUserRole,
): boolean {
  if (actor === "admin") return true;
  // "✓ (not admins)". An ops manager who could edit an admin seat could
  // promote themselves, and every other denial in their row would be advisory.
  if (actor === "ops_manager") return target !== "admin";
  return false;
}
