import { describe, it, expect } from "vitest";
import {
  dashboardCanAccess,
  managerCanAccess,
  MANAGER_HOME,
  MANAGER_SECTIONS,
  visibleAdminNav,
} from "@/lib/admin/manager-scope";

/**
 * These rules decide whether an employee can change what the restaurant
 * charges, who has a login, or where the money is paid. The tests that matter
 * are the denials.
 *
 * The two lists below mirror the dashboard sidebar. If a nav group changes and
 * these aren't updated, that is the point: a new page is closed to managers
 * until somebody decides otherwise.
 */

/** Every "Settings" item in the sidebar — all owner-only. */
const SETTINGS = [
  "/admin/account",
  "/admin/branches",
  "/admin/staff",
  "/admin/cashier",
  "/admin/storefront",
  "/admin/branding",
  "/admin/delivery",
  "/admin/printing",
  "/admin/domains",
  "/admin/billing",
  "/admin/export",
  "/admin/audit",
];

/** Every item in the four groups a manager runs. */
const ALLOWED = [
  "/admin",
  "/admin/announcements",
  "/admin/menu",
  "/admin/modifiers",
  "/admin/tables",
  "/admin/floor",
  "/admin/reservations",
  "/admin/advance-orders",
  "/kitchen",
  "/cashier",
  "/merchant",
  "/admin/shifts",
  "/clock/me",
  "/admin/orders",
  "/admin/analytics",
  "/admin/accounting",
  "/admin/feedback",
  "/admin/promotions",
  "/admin/happy-hours",
  "/admin/gift-cards",
  "/admin/loyalty",
  "/admin/customers",
  "/admin/sms",
  "/admin/content",
  "/admin/inventory",
  "/admin/hr",
];

describe("managerCanAccess", () => {
  it("opens every screen in the four groups a manager runs", () => {
    for (const p of ALLOWED) expect(managerCanAccess(p), p).toBe(true);
  });

  it("closes every settings screen", () => {
    for (const p of SETTINGS) expect(managerCanAccess(p), p).toBe(false);
  });

  it("does not let '/admin' swallow the settings pages", () => {
    // The dashboard lives at /admin and every settings page is under it, so a
    // prefix match on "/admin" would hand over the entire thing.
    expect(managerCanAccess("/admin")).toBe(true);
    expect(managerCanAccess("/admin/billing")).toBe(false);
  });

  it("reaches the pages inside an allowed section", () => {
    expect(managerCanAccess("/admin/menu/new")).toBe(true);
    expect(managerCanAccess("/admin/hr/schedule")).toBe(true);
    expect(managerCanAccess("/admin/inventory/purchase-orders")).toBe(true);
  });

  it("does not let a near-miss name through", () => {
    expect(managerCanAccess("/admin/menu-prices")).toBe(false);
    expect(managerCanAccess("/admin/staff-costs")).toBe(false);
    expect(managerCanAccess("/cashiers")).toBe(false);
  });

  it("is not fooled by a trailing slash or a query string", () => {
    expect(managerCanAccess("/admin/menu/")).toBe(true);
    expect(managerCanAccess("/admin/billing/")).toBe(false);
    expect(managerCanAccess("/admin/billing?upgrade=inventory")).toBe(false);
  });

  it("closes a dashboard page nobody has written yet", () => {
    expect(managerCanAccess("/admin/payouts")).toBe(false);
  });

  it("lands managers somewhere they can actually open", () => {
    expect(managerCanAccess(MANAGER_HOME)).toBe(true);
  });
});

describe("dashboardCanAccess", () => {
  it("lets the owner everywhere", () => {
    for (const p of [...ALLOWED, ...SETTINGS]) {
      expect(dashboardCanAccess("admin", p), p).toBe(true);
    }
  });

  it("holds the manager to their sections", () => {
    expect(dashboardCanAccess("manager", "/admin/menu")).toBe(true);
    expect(dashboardCanAccess("manager", "/admin/billing")).toBe(false);
  });
});

describe("visibleAdminNav", () => {
  const NAV = [
    { group: "", items: [{ href: "/admin" }] },
    { group: "Menu", items: [{ href: "/admin/menu" }, { href: "/admin/tables" }] },
    { group: "Back office", items: [{ href: "/admin/inventory" }, { href: "/admin/hr" }] },
    { group: "Settings", items: [{ href: "/admin/billing" }, { href: "/admin/staff" }] },
  ];

  it("shows the owner everything", () => {
    expect(visibleAdminNav("admin", NAV)).toHaveLength(4);
  });

  it("drops the Settings group entirely for a manager", () => {
    const groups = visibleAdminNav("manager", NAV).map((s) => s.group);
    expect(groups).toEqual(["", "Menu", "Back office"]);
  });

  it("never leaves an empty group heading behind", () => {
    // A "Settings" heading with nothing under it looks like a broken page.
    for (const section of visibleAdminNav("manager", NAV)) {
      expect(section.items.length).toBeGreaterThan(0);
    }
  });

  it("only shows links that actually open", () => {
    // A visible link that bounces is a bug report; a hidden link that works is
    // a hole. Same rule on both sides.
    for (const section of visibleAdminNav("manager", NAV)) {
      for (const item of section.items) expect(managerCanAccess(item.href)).toBe(true);
    }
  });

  it("every declared section is reachable", () => {
    for (const s of MANAGER_SECTIONS) expect(managerCanAccess(s)).toBe(true);
  });
});
