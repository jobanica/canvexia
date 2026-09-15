import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  CAPABILITIES,
  PARTNER_USER_ROLES,
  can,
  capabilitiesOf,
  isPartnerUserRole,
  requireCapability,
  toRole,
  type Capability,
  type PartnerUserRole,
} from "@servd/core";

/**
 * The permission matrix.
 *
 * Worth testing without a database because the matrix IS the decision: RLS
 * scopes a partner to their own rows, and this is the only thing that stops one
 * of their own staff reading the revenue.
 */
describe("partner capabilities", () => {
  it("gives admin everything", () => {
    for (const c of CAPABILITIES) expect(can("admin", c), c).toBe(true);
  });

  it("keeps sales out of money, brand and team", () => {
    for (const c of ["revenue.read", "revenue.pricing", "brand.write", "domains.write", "team.read", "team.write", "settings.write"] as Capability[]) {
      expect(can("sales", c), c).toBe(false);
    }
  });

  it("keeps support out of money, brand and team", () => {
    for (const c of ["revenue.read", "revenue.pricing", "brand.write", "team.write", "settings.write"] as Capability[]) {
      expect(can("support", c), c).toBe(false);
    }
  });

  it("gives impersonation to support and to NOBODY else but admin", () => {
    // The single most dangerous capability here: it puts one tenant inside
    // another tenant's data by design. A salesperson has no reason to be inside
    // a merchant's till, and this assertion is what says so.
    expect(can("support", "merchants.impersonate")).toBe(true);
    expect(can("admin", "merchants.impersonate")).toBe(true);
    expect(can("sales", "merchants.impersonate")).toBe(false);
  });

  it("lets sales open accounts and support only look at them", () => {
    expect(can("sales", "merchants.create")).toBe(true);
    expect(can("support", "merchants.create")).toBe(false);
    expect(can("sales", "pipeline.write")).toBe(true);
    expect(can("support", "pipeline.write")).toBe(false);
  });

  it("gives nobody but admin the ability to change what a merchant pays", () => {
    // `ops_manager` is EXCLUDED here and asserted in the A7 suite instead.
    // This legacy matrix has no vocabulary for the money/brand denials that
    // define that role — it maps ops_manager onto the admin row — so asking it
    // this question gets an answer it cannot give. The A7 grid answers it:
    // `pricing.edit` is admin-only there, and `merchants.change_plan` is
    // admin + ops_manager, which is the brief's own table.
    for (const role of PARTNER_USER_ROLES) {
      if (role === "ops_manager") continue;
      expect(can(role, "merchants.manage"), role).toBe(role === "admin");
      expect(can(role, "revenue.pricing"), role).toBe(role === "admin");
    }
  });

  it("requireCapability throws FORBIDDEN rather than returning false", () => {
    // The reason this function exists: `can(role, x)` without an `if` reads
    // like a guard and is not one.
    expect(() => requireCapability("sales", "revenue.read")).toThrowError("FORBIDDEN");
    expect(() => requireCapability("admin", "revenue.read")).not.toThrow();
  });

  it("never lets a non-admin hold more than admin", () => {
    const adminSet = new Set(capabilitiesOf("admin"));
    for (const role of PARTNER_USER_ROLES) {
      for (const c of capabilitiesOf(role)) expect(adminSet.has(c), `${role}:${c}`).toBe(true);
    }
  });
});

describe("the stored role vocabulary", () => {
  it("stores short names and refuses anything else", () => {
    expect(PARTNER_USER_ROLES).toEqual(["admin", "ops_manager", "sales", "support"]);
    for (const bad of ["partner_admin", "partner_staff", "owner", "", "ADMIN"]) {
      expect(isPartnerUserRole(bad), bad).toBe(false);
    }
  });

  it("does NOT store partner_staff — the legacy synonym is code-only", () => {
    // It stays in the platform-wide Role union because that type is exported and
    // narrowing on it elsewhere would break. Nothing new may be created holding
    // it, which is what this asserts.
    expect(isPartnerUserRole("partner_staff")).toBe(false);
  });

  it("widens to the platform vocabulary without losing the level", () => {
    expect(toRole("admin")).toBe("partner_admin");
    expect(toRole("ops_manager")).toBe("partner_ops_manager");
    expect(toRole("sales")).toBe("partner_sales");
    expect(toRole("support")).toBe("partner_support");
  });

  it("matches the database CHECK constraint", () => {
    // If one side gains a role and the other does not, inserts start failing in
    // production and nothing here would have said so.
    //
    // Reads the LAST file that defines the constraint, not the first. A7 drops
    // and re-adds it in add-partner-staff.sql to make room for ops_manager;
    // pinning this to add-partner-portal.sql would assert a constraint that no
    // longer exists on any database that has run both.
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const dir = path.join(process.cwd(), "../../packages/db/prisma/manual");
    const re = /partner_users_role_check[\s\S]*?CHECK \("role" IN \(([^)]+)\)\)/;

    const defining = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => ({ file: f, sql: fs.readFileSync(path.join(dir, f), "utf8") }))
      .filter((f) => re.test(f.sql));

    // Both files must still be found: if the later one is ever deleted this
    // silently falls back to asserting the three-role set and passes.
    expect(defining.map((d) => d.file).sort()).toEqual([
      "add-partner-portal.sql",
      "add-partner-staff.sql",
    ]);

    const latest = defining.find((d) => d.file === "add-partner-staff.sql")!;
    const inSql = latest.sql.match(re)![1].split(",").map((s) => s.trim().replace(/'/g, ""));
    expect(inSql.sort()).toEqual([...PARTNER_USER_ROLES].sort());
  });
});

describe("partner pages hide rather than disable", () => {
  /**
   * Every screen under /partner whose whole purpose needs a capability must ask
   * for it at the page, not only at the action.
   *
   * `/partner/brand` rendered the full brand form for a `sales` seat and then
   * rejected the submit, and `/partner/demo/[id]` did worse — a full menu
   * editor whose every button silently no-opped. Both are the same miss: the
   * sidebar hid the link, and a typed URL did not care.
   *
   * Only pages that actually reach for the bare session gate are checked, so
   * the public ones (apply, login, forgot-password) need no entry here. The one
   * deliberate exception is named rather than pattern-matched, so adding a
   * second is a decision somebody makes on purpose.
   */
  const OPEN = new Set([
    // The dashboard. Every seat sees it — that is what it is for, and the cards
    // on it hide their own controls per capability.
    "page.tsx",
  ]);

  const pagesUnder = (dir: string, prefix = ""): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? pagesUnder(join(dir, e.name), `${prefix}${e.name}/`)
        : e.name === "page.tsx"
          ? [`${prefix}${e.name}`]
          : [],
    );

  it("no /partner page falls back to the bare session gate", () => {
    const root = join(process.cwd(), "src/app/(platform)/partner");
    const offenders = pagesUnder(root).filter(
      (rel) => !OPEN.has(rel) && readFileSync(join(root, rel), "utf8").includes("requirePartnerPage()"),
    );
    expect(
      offenders,
      `these render without a capability: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("still sees the pages, so the guard is not scanning an empty directory", () => {
    const found = pagesUnder(join(process.cwd(), "src/app/(platform)/partner"));
    expect(found).toContain("brand/page.tsx");
    expect(found).toContain("demo/[id]/page.tsx");
    expect(found.length).toBeGreaterThan(6);
  });
});
