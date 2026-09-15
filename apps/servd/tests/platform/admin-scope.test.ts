import { describe, it, expect } from "vitest";
import {
  canAccessPath,
  homeForAdmin,
  OPS_SECTIONS,
  parseAdminRole,
  visibleNav,
  type AdminRole,
} from "@/lib/platform/admin-scope";
import { hqCan } from "@servd/core";

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

  it("lands BOTH HQ roles on the CANVEXIA console, not a Servd section", () => {
    // These used to be /super-admin and /super-admin/bizops. `platform_admins`
    // is deliberately one table for both consoles — CANVEXIA runs Servd, so
    // every HQ seat is also a Servd super-admin — but /hq is the parent of the
    // two and /super-admin is one product's back office, reachable from the HQ
    // sidebar. Arriving in the narrower console said the wrong thing about
    // which of the two contains the other.
    expect(homeForAdmin("owner")).toBe("/hq");
    expect(homeForAdmin("ops")).toBe("/hq");
  });

  it("sends an ops admin who overreaches somewhere they can actually open", () => {
    // OPS_HOME is also the bounce target from the /super-admin layout. The
    // invariant above already covers it; this says out loud that the bounce
    // must not land on a screen the role is refused, which would loop.
    expect(canAccessPath("ops", homeForAdmin("ops"))).toBe(true);
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

describe("the HQ console sections", () => {
  it("lets ops open the HQ overview and the sections it is allowed", () => {
    for (const p of [
      "/hq",
      "/hq/partners",
      "/hq/partners/abc-123",
      "/hq/territories",
      "/hq/applications",
      "/hq/merchants",
      "/hq/products",
      "/hq/billing",
      "/hq/announcements",
      "/hq/audit",
    ]) {
      expect(canAccessPath("ops", p), p).toBe(true);
    }
  });

  it("keeps ops out of /hq/team", () => {
    // The near-miss this guards: "/hq" as a PREFIX in OPS_SECTIONS would match
    // "/hq/team" too, and hand an ops admin the screen that creates HQ seats.
    // The overview is an exact path for exactly this reason.
    expect(canAccessPath("ops", "/hq/team")).toBe(false);
    expect(canAccessPath("ops", "/hq/team/invite")).toBe(false);
    expect(canAccessPath("owner", "/hq/team")).toBe(true);
  });

  it("does not let a near-miss path through", () => {
    // Same segment rule as the Servd sections: a plain startsWith would admit
    // "/hq/partners-export" on the strength of "/hq/partners".
    expect(canAccessPath("ops", "/hq/partners-export")).toBe(false);
    expect(canAccessPath("ops", "/hq-admin")).toBe(false);
  });

  it("is a path gate only, not the capability matrix", () => {
    // Reaching /hq/billing is not being allowed to adjust a ledger. That check
    // lives in requireHqAction, at the server action, because an action is
    // reachable by its id from any page.
    expect(canAccessPath("ops", "/hq/billing")).toBe(true);
    expect(hqCan("ops", "billing.adjust")).toBe(false);
  });
});
