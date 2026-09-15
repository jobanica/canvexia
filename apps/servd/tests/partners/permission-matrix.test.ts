import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PARTNER_PERMISSIONS,
  PARTNER_USER_ROLES,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  PERMISSIONS_WITHOUT_SCREENS,
  canManageSeatRole,
  defaultPermissionsOf,
  isGridLocked,
  isPartnerPermission,
  permissionDefault,
  type PartnerPermission,
} from "@servd/core";

/**
 * The A7 permission matrix.
 *
 * Worth testing without a database because the matrix IS the decision: RLS
 * scopes a partner to its own rows, and this is the only thing standing between
 * a salesperson and their own operator's revenue share.
 */

describe("the key set", () => {
  it("carries the brief's 25 keys plus the four a shipped screen needs", () => {
    expect(PARTNER_PERMISSIONS).toHaveLength(29);
    // The four that are NOT in the brief's table. They exist because mapping
    // the old 14 capabilities onto the brief's 25 leaves these with nowhere to
    // go, and dropping them would remove working features.
    for (const bridge of [
      "pipeline.write",
      "merchants.note",
      "domains.write",
      "settings.write",
    ] as const) {
      expect(isPartnerPermission(bridge), bridge).toBe(true);
    }
  });

  it("labels and groups every key exactly once", () => {
    // A key with no label renders as a blank row in the grid; a key in no group
    // does not render at all, which is the same as denying it silently.
    const grouped = PERMISSION_GROUPS.flatMap((g) => g.keys);
    expect([...grouped].sort()).toEqual([...PARTNER_PERMISSIONS].sort());
    expect(grouped).toHaveLength(new Set(grouped).size);
    for (const k of PARTNER_PERMISSIONS) {
      expect(PERMISSION_LABELS[k], k).toBeTruthy();
    }
  });

  it("refuses anything not in the set", () => {
    for (const bad of ["", "admin", "merchants.*", "MERCHANTS.CREATE", "revenue.read"]) {
      expect(isPartnerPermission(bad), bad).toBe(false);
    }
  });
});

describe("the defaults, against the brief's own table", () => {
  /**
   * Transcribed from the brief, cell by cell, in its own order.
   *
   * This is the assertion that matters most in the file: the matrix in
   * packages/core is a long list of strings, and a key in the wrong role's
   * array is invisible on review. Here the shape is the table, so a
   * misplacement is a diff.
   */
  const TABLE: [PartnerPermission, boolean, boolean, boolean, boolean][] = [
    // key                        admin  ops    sales  support
    ["overview.view", true, true, true, true],
    ["overview.revenue_amounts", true, false, false, false],
    ["merchants.view_all", true, true, false, true],
    ["merchants.view_assigned", true, true, true, true],
    ["merchants.create", true, true, true, false],
    ["merchants.change_plan", true, true, false, false],
    ["merchants.suspend", true, true, false, false],
    ["merchants.login_as", true, true, false, true],
    ["pipeline.view_all", true, true, false, false],
    ["pipeline.view_own", true, true, true, false],
    ["pipeline.assign", true, true, false, false],
    ["revenue.view", true, false, false, false],
    ["pricing.edit", true, false, false, false],
    ["brand.edit", true, false, false, false],
    ["team.manage", true, true, false, false],
    ["team.permissions", true, false, false, false],
    ["hr.view_all", true, true, false, false],
    ["hr.view_own", true, true, true, true],
    ["hr.set_targets", true, true, false, false],
    ["attendance.checkin", true, true, true, true],
    ["attendance.view_all", true, true, false, false],
    ["commissions.view_own", true, true, true, true],
    ["commissions.manage", true, false, false, false],
    ["support.tickets", true, true, false, true],
    ["settings.payout", true, false, false, false],
  ];

  it("matches every cell", () => {
    for (const [key, admin, ops, sales, support] of TABLE) {
      expect(permissionDefault("admin", key), `admin:${key}`).toBe(admin);
      expect(permissionDefault("ops_manager", key), `ops_manager:${key}`).toBe(ops);
      expect(permissionDefault("sales", key), `sales:${key}`).toBe(sales);
      expect(permissionDefault("support", key), `support:${key}`).toBe(support);
    }
  });

  it("covers the whole brief table, so a dropped row cannot pass", () => {
    expect(TABLE).toHaveLength(25);
  });

  it("keeps the four bridge keys where the old matrix had them", () => {
    // A7 must not quietly take away a feature that worked yesterday.
    expect(permissionDefault("sales", "pipeline.write")).toBe(true);
    expect(permissionDefault("support", "pipeline.write")).toBe(false);
    expect(permissionDefault("support", "merchants.note")).toBe(true);
    for (const role of PARTNER_USER_ROLES) {
      expect(permissionDefault(role, "domains.write"), role).toBe(role === "admin");
      expect(permissionDefault(role, "settings.write"), role).toBe(role === "admin");
    }
  });
});

describe("the shape of the roles", () => {
  it("gives admin every key, including the two with no screen yet", () => {
    expect(defaultPermissionsOf("admin")).toHaveLength(PARTNER_PERMISSIONS.length);
    // So that when a ticket system is built, the person who owns the account is
    // not locked out of the screen on the day it ships.
    for (const k of PERMISSIONS_WITHOUT_SCREENS) {
      expect(permissionDefault("admin", k), k).toBe(true);
    }
  });

  it("never lets a non-admin hold more than admin", () => {
    const admin = new Set(defaultPermissionsOf("admin"));
    for (const role of PARTNER_USER_ROLES) {
      for (const k of defaultPermissionsOf(role)) expect(admin.has(k), `${role}:${k}`).toBe(true);
    }
  });

  it("denies ops_manager the four things that define the role", () => {
    // Money, brand, and the grid. The last one is what keeps the other three
    // real: an ops manager who could edit the grid could grant themselves the
    // revenue, and every denial above it would be decorative.
    for (const k of [
      "revenue.view",
      "pricing.edit",
      "brand.edit",
      "team.permissions",
      "commissions.manage",
      "settings.payout",
      "overview.revenue_amounts",
    ] as const) {
      expect(permissionDefault("ops_manager", k), k).toBe(false);
    }
  });

  it("gives sales nothing that reads another person's work", () => {
    for (const k of [
      "pipeline.view_all",
      "merchants.view_all",
      "hr.view_all",
      "attendance.view_all",
    ] as const) {
      expect(permissionDefault("sales", k), k).toBe(false);
    }
  });
});

describe("the two rules the grid cannot express", () => {
  it("locks admin's own hold on the grid and the team", () => {
    // Both would leave the screen that grants access unreachable from inside
    // it, and the only way back would be hand-run SQL — the same refusal
    // /hq/team makes about the last super admin.
    expect(isGridLocked("admin", "team.permissions")).toBe(true);
    expect(isGridLocked("admin", "team.manage")).toBe(true);
    expect(isGridLocked("ops_manager", "team.manage")).toBe(false);
    expect(isGridLocked("admin", "brand.edit")).toBe(false);
  });

  it("stops an ops_manager editing an admin seat", () => {
    // The brief writes this as "✓ (not admins)", which is a constraint on the
    // OBJECT of the action and not a permission — there is no key that could
    // hold it. An ops manager who could edit an admin seat could promote
    // themselves.
    expect(canManageSeatRole("ops_manager", "sales")).toBe(true);
    expect(canManageSeatRole("ops_manager", "support")).toBe(true);
    expect(canManageSeatRole("ops_manager", "ops_manager")).toBe(true);
    expect(canManageSeatRole("ops_manager", "admin")).toBe(false);
    expect(canManageSeatRole("admin", "admin")).toBe(true);
    expect(canManageSeatRole("sales", "sales")).toBe(false);
    expect(canManageSeatRole("support", "sales")).toBe(false);
  });
});

describe("the migration and the code agree", () => {
  const sql = readFileSync(
    join(process.cwd(), "../../packages/db/prisma/manual/add-partner-staff.sql"),
    "utf8",
  );

  it("creates every table the schema declares", () => {
    for (const t of [
      "partner_role_permissions",
      "staff_events",
      "staff_targets",
      "attendance_sessions",
      "staff_visits",
      "commission_rules",
      "commission_statements",
      "commission_lines",
    ]) {
      expect(sql, t).toContain(`CREATE TABLE IF NOT EXISTS "${t}"`);
    }
  });

  it("adds the assignment columns to BOTH merchant tables", () => {
    // D29: each product has its own merchant table. One of these without the
    // other is a directory that shows half a salesperson's book.
    // Whitespace-tolerant: the migration aligns the ALTERs into a column, so
    // matching a single space would fail on formatting rather than on meaning.
    for (const t of ["restaurants", "pharmacies"]) {
      for (const col of ["assignedSalesUserId", "assignedSupportUserId"]) {
        const re = new RegExp(
          `ALTER TABLE "${t}"\\s+ADD COLUMN IF NOT EXISTS\\s+"${col}"`,
        );
        expect(re.test(sql), `${t}.${col}`).toBe(true);
      }
    }
  });

  it("records the actor's role on the audit log", () => {
    expect(sql).toContain('ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "actorRole"');
  });

  it("makes every replayable write idempotent by clientRef", () => {
    // The offline queue on a phone in a market WILL replay. Without these two
    // indexes a sync retry is a second visit in the log and a second day's
    // attendance.
    expect(sql).toContain('"attendance_sessions_clientRef_key"');
    expect(sql).toContain('"staff_visits_clientRef_key"');
    expect(sql).toContain('"commission_lines_statement_entry_key"');
  });
});

describe("the RLS file carries the new tables", () => {
  const rls = readFileSync(join(process.cwd(), "../../packages/db/prisma/rls.sql"), "utf8");

  it("names all eight, so the backstop cannot lock them to super-admin", () => {
    // D27: rls.sql sweeps every policy-less table into super_only. A staff
    // table caught by that sweep is a 500 on a screen a partner owns.
    for (const t of [
      "staff_events",
      "staff_targets",
      "attendance_sessions",
      "staff_visits",
      "commission_rules",
      "commission_statements",
      "commission_lines",
      "partner_role_permissions",
    ]) {
      expect(rls, t).toContain(t);
    }
  });

  it("defines the seat GUC and the permission helper", () => {
    expect(rls).toContain("app.current_partner_user_id()");
    expect(rls).toContain("app.has_permission(perm text)");
  });

  it("leaves the pre-A7 partner policies alone", () => {
    // The decision in §0.3 of the plan, asserted rather than trusted: the 22
    // existing partner policy arms still ask ONE question. If a later change
    // starts threading the seat through them, this fails and the trade gets
    // re-argued rather than drifted into.
    const before = rls.slice(0, rls.indexOf("-- A7 — the staff tables"));
    const seatArms = before.match(/app\.current_partner_user_id\(\)/g) ?? [];
    // Only the two in the helper definitions themselves.
    expect(seatArms.length).toBe(2);
  });
});
