import { describe, it, expect } from "vitest";
import {
  canAccessPath,
  homeForAdmin,
  OPS_SECTIONS,
  parseAdminRole,
  visibleNav,
  type AdminRole,
} from "@/lib/platform/admin-scope";

/**
 * These rules decide whether a hired staff member can change what Servd
 * charges or email all 314 restaurants. The tests that matter are the denials.
 */

describe("parseAdminRole", () => {
  it("treats a stored NULL as the founder", () => {
    // Every admin row predating this feature has NULL. Reading that as
    // restricted would lock the founder out of their own back office.
    expect(parseAdminRole(null)).toBe("owner");
    expect(parseAdminRole(undefined)).toBe("owner");
  });

  it("only 'ops' restricts, and unknown text does not", () => {
    expect(parseAdminRole("ops")).toBe("ops");
    // A typo in the column must not silently invent a third privilege level.
    expect(parseAdminRole("Ops")).toBe("owner");
    expect(parseAdminRole("junk")).toBe("owner");
  });
});

describe("canAccessPath", () => {
  it("lets the owner everywhere", () => {
    for (const p of ["/super-admin", "/super-admin/payments", "/super-admin/feature-pricing"]) {
      expect(canAccessPath("owner", p)).toBe(true);
    }
  });

  it("opens the sections the role exists to work", () => {
    expect(canAccessPath("ops", "/super-admin/bizops")).toBe(true);
    expect(canAccessPath("ops", "/super-admin/bizops/follow-ups")).toBe(true);
    expect(canAccessPath("ops", "/super-admin/bizops/customers/abc-123")).toBe(true);
    expect(canAccessPath("ops", "/super-admin/accounts")).toBe(true);
    expect(canAccessPath("ops", "/super-admin/storefronts")).toBe(true);
    expect(canAccessPath("ops", "/super-admin/subscriptions")).toBe(true);
  });

  it("keeps ops out of the money", () => {
    for (const p of [
      "/super-admin/feature-pricing",
      "/super-admin/plans",
      "/super-admin/invoices",
      "/super-admin/payments",
      "/super-admin/partners",
    ]) {
      expect(canAccessPath("ops", p)).toBe(false);
    }
  });

  it("keeps ops away from anything that speaks to every customer at once", () => {
    for (const p of [
      "/super-admin/email",
      "/super-admin/announcements",
      "/super-admin/content-engine",
      "/super-admin/tutorials",
      "/super-admin/feedback",
    ]) {
      expect(canAccessPath("ops", p)).toBe(false);
    }
  });

  it("denies the platform overview, which totals the whole business", () => {
    expect(canAccessPath("ops", "/super-admin")).toBe(false);
  });

  it("does not let a near-miss name through", () => {
    // "/super-admin/accounts" is allowed; a startsWith check would hand over
    // "/super-admin/accounts-billing" along with it.
    expect(canAccessPath("ops", "/super-admin/accounts-billing")).toBe(false);
    expect(canAccessPath("ops", "/super-admin/crm-exports")).toBe(false);
    expect(canAccessPath("ops", "/super-admin/bizopsecret")).toBe(false);
  });

  it("is not fooled by a trailing slash or a query string", () => {
    expect(canAccessPath("ops", "/super-admin/bizops/")).toBe(true);
    expect(canAccessPath("ops", "/super-admin/payments/")).toBe(false);
    expect(canAccessPath("ops", "/super-admin/payments?tab=keys")).toBe(false);
  });

  it("denies a section nobody has written yet", () => {
    // The rule is fail-closed: a back-office page added next month is invisible
    // to ops until somebody deliberately adds it to OPS_SECTIONS.
    expect(canAccessPath("ops", "/super-admin/payouts")).toBe(false);
  });
});

describe("homeForAdmin", () => {
  it("never sends anyone somewhere they'd be bounced from", () => {
    // The bug this pins down: sign-in sent every admin to the overview, the
    // layout redirected the restricted ones away, and a redirect chained out of
    // the sign-in action's own redirect rendered as a blank page until reload.
    // A landing page the role can't open is the defect, whatever it looks like.
    for (const role of ["owner", "ops"] as AdminRole[]) {
      expect(canAccessPath(role, homeForAdmin(role))).toBe(true);
    }
  });

  it("keeps the founder on the overview", () => {
    expect(homeForAdmin("owner")).toBe("/super-admin");
  });

  it("starts ops on the business screen", () => {
    expect(homeForAdmin("ops")).toBe("/super-admin/bizops");
  });
});

describe("visibleNav", () => {
  const NAV = [
    { label: "Overview", href: "/super-admin" },
    { label: "Business", href: "/super-admin/bizops" },
    { label: "Follow-ups", href: "/super-admin/bizops/follow-ups" },
    { label: "Feature pricing", href: "/super-admin/feature-pricing" },
    { label: "Payments", href: "/super-admin/payments" },
  ];

  it("shows the owner the whole menu", () => {
    expect(visibleNav("owner", NAV)).toHaveLength(NAV.length);
  });

  it("hides what ops cannot open", () => {
    const labels = visibleNav("ops", NAV).map((n) => n.label);
    expect(labels).toEqual(["Business", "Follow-ups"]);
  });

  it("agrees with the guard on every link it shows", () => {
    // A visible link that bounces is a bug report; a hidden link that works is
    // a security hole. They have to be the same rule.
    for (const role of ["owner", "ops"] as AdminRole[]) {
      for (const item of visibleNav(role, NAV)) {
        expect(canAccessPath(role, item.href)).toBe(true);
      }
    }
  });

  it("every declared section is reachable by ops", () => {
    for (const s of OPS_SECTIONS) expect(canAccessPath("ops", s)).toBe(true);
  });
});
