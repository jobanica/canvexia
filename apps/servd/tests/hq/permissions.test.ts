import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HQ_CAPABILITIES,
  HQ_USER_ROLES,
  hqCan,
  hqCapabilitiesOf,
  isHqUserRole,
  parseHqRole,
  requireHqCapability,
  toHqRole,
  type HqCapability,
} from "@servd/core";

/**
 * The HQ permission matrix.
 *
 * Worth testing without a database for the same reason the partner one is:
 * there is no RLS boundary between `hq_super_admin` and `hq_ops`. Both run in a
 * super-admin context and both can read every row in the schema — that is what
 * an HQ console is. This matrix is the ONLY thing standing between someone
 * hired to work the pipeline and the ability to change what every merchant in
 * the country pays.
 */
describe("HQ capabilities", () => {
  it("gives super_admin everything", () => {
    for (const c of HQ_CAPABILITIES) expect(hqCan("super_admin", c), c).toBe(true);
  });

  it("denies ops exactly the four the brief names, plus impersonation and the sending key", () => {
    const denied: HqCapability[] = [
      "partners.suspend",
      "plans.floor",
      "billing.adjust",
      "hq.team",
      "hq.impersonate",
      // Added with /hq/settings/email. A live provider credential, in the same
      // class as billing.adjust: whoever holds it decides what address every
      // partner invitation appears to come from.
      "settings.email",
    ];
    for (const c of denied) expect(hqCan("ops", c), c).toBe(false);

    // And nothing else. A capability quietly added to the denied list later
    // would silently shrink what ops can do, with no screen to notice it.
    for (const c of HQ_CAPABILITIES) {
      expect(hqCan("ops", c), c).toBe(!denied.includes(c));
    }
  });

  it("lets ops run a statement but never adjust one", () => {
    // These two live next to each other on /hq/billing and are not the same
    // kind of act: freezing is arithmetic over rows that already exist,
    // adjusting is money moving because somebody typed a number.
    expect(hqCan("ops", "billing.run")).toBe(true);
    expect(hqCan("ops", "billing.adjust")).toBe(false);
  });

  it("lets ops edit a partner but never suspend one", () => {
    expect(hqCan("ops", "partners.write")).toBe(true);
    expect(hqCan("ops", "partners.suspend")).toBe(false);
  });

  it("requireHqCapability throws FORBIDDEN rather than returning false", () => {
    expect(() => requireHqCapability("ops", "billing.adjust")).toThrowError("FORBIDDEN");
    expect(() => requireHqCapability("super_admin", "billing.adjust")).not.toThrow();
  });

  it("never lets ops hold more than super_admin", () => {
    const full = new Set(hqCapabilitiesOf("super_admin"));
    for (const c of hqCapabilitiesOf("ops")) expect(full.has(c), c).toBe(true);
  });

  it("keeps the HQ and partner vocabularies apart", () => {
    // Deliberately two matrices. "merchants.read" on the partner side means
    // "the merchants this partner owns"; HQ reads every merchant there is. One
    // capability whose meaning depends on who is asking is the thing to avoid.
    const hq = HQ_CAPABILITIES as readonly string[];
    for (const c of ["merchants.read", "revenue.read", "team.write", "settings.write"]) {
      expect(hq.includes(c), c).toBe(false);
    }
  });
});

describe("the stored HQ role vocabulary", () => {
  it("stores short names and refuses anything else", () => {
    expect(HQ_USER_ROLES).toEqual(["super_admin", "ops"]);
    for (const bad of ["hq_super_admin", "hq_admin", "owner", "", "OPS"]) {
      expect(isHqUserRole(bad), bad).toBe(false);
    }
  });

  it("reads NULL as super_admin, because that is what NULL has always meant", () => {
    // platform_admins.role is NULL on every row that predates the column. A
    // parse that read NULL as `ops` would demote the founder out of their own
    // back office on deploy.
    expect(parseHqRole(null)).toBe("super_admin");
    expect(parseHqRole(undefined)).toBe("super_admin");
    expect(parseHqRole("ops")).toBe("ops");
  });

  it("does not demote on an unrecognised value", () => {
    // A typo is caught by the CHECK constraint on the column. Treating garbage
    // as `ops` here would mean a bad write locks the founder out silently.
    expect(parseHqRole("opz")).toBe("super_admin");
  });

  it("widens to the platform vocabulary without losing the level", () => {
    expect(toHqRole("super_admin")).toBe("hq_super_admin");
    expect(toHqRole("ops")).toBe("hq_ops");
  });

  it("matches the database CHECK constraint", () => {
    // Same drift guard as the partner roles: if one side gains a role and the
    // other does not, inserts start failing in production and nothing here
    // would have said so.
    const sql = readFileSync(
      join(process.cwd(), "../../packages/db/prisma/manual/add-hq-admin.sql"),
      "utf8",
    );
    const match = sql.match(/platform_admins_role_check[\s\S]*?CHECK \(\s*"role" IS NULL OR "role" IN \(([^)]+)\)\)/);
    expect(match, "the CHECK constraint moved or was renamed").toBeTruthy();
    const inSql = match![1].split(",").map((s) => s.trim().replace(/'/g, ""));
    expect(inSql.sort()).toEqual([...HQ_USER_ROLES].sort());
  });
});
