import { describe, it, expect } from "vitest";
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
    for (const role of PARTNER_USER_ROLES) {
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
    expect(PARTNER_USER_ROLES).toEqual(["admin", "sales", "support"]);
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
    expect(toRole("sales")).toBe("partner_sales");
    expect(toRole("support")).toBe("partner_support");
  });

  it("matches the database CHECK constraint", () => {
    // packages/db/prisma/manual/add-partner-portal.sql spells this set out in a
    // CHECK. If one side gains a role and the other does not, inserts start
    // failing in production and nothing here would have said so.
    const sql = require("node:fs").readFileSync(
      require("node:path").join(process.cwd(), "../../packages/db/prisma/manual/add-partner-portal.sql"),
      "utf8",
    ) as string;
    const match = sql.match(/partner_users_role_check[\s\S]*?CHECK \("role" IN \(([^)]+)\)\)/);
    expect(match, "the CHECK constraint moved or was renamed").toBeTruthy();
    const inSql = match![1].split(",").map((s) => s.trim().replace(/'/g, ""));
    expect(inSql.sort()).toEqual([...PARTNER_USER_ROLES].sort());
  });
});
