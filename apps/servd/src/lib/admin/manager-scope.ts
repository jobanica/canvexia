/**
 * What a manager may reach in the restaurant dashboard.
 *
 * A manager runs the floor: the menu, the service screens, the marketing and
 * the back office. They do not run the business — pricing, billing, payment
 * credentials, who has a login, the public website and the audit trail stay
 * with the owner.
 *
 * Pure and allow-listed. A dashboard page added next month is closed to
 * managers until somebody opens it deliberately, which is the safe direction
 * for a permission table: the cost of a missing entry is a manager asking for
 * access, and the cost of a missing exclusion is a manager changing prices.
 */

/**
 * Sections a manager may open, as path prefixes.
 *
 * These are the "Menu", "Operations", "Grow" and "Back office" groups of the
 * dashboard sidebar, plus the dashboard itself — without a landing page a
 * manager has nowhere to sign in to, and its figures are the same ones the
 * Analytics screen already shows them.
 *
 * Everything in the "Settings" group is deliberately absent.
 */
export const MANAGER_SECTIONS = [
  // Landing
  "/admin/announcements",
  // Menu
  "/admin/menu",
  "/admin/modifiers",
  "/admin/tables",
  "/admin/floor",
  "/admin/reservations",
  "/admin/advance-orders",
  // Operations — the live service screens, which sit outside /admin
  "/kitchen",
  "/cashier",
  "/merchant",
  "/admin/shifts",
  "/clock",
  // Grow
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
  // Back office
  "/admin/inventory",
  "/admin/hr",
] as const;

/**
 * Paths a manager may open but which grant NOTHING beneath them.
 *
 * The dashboard is the whole reason this list exists separately: it lives at
 * "/admin" and every settings page is nested under it, so treating it as a
 * section prefix would hand over billing, staff and the audit log in one line.
 */
export const MANAGER_EXACT = ["/admin"] as const;

/** Where a manager lands after signing in. */
export const MANAGER_HOME = "/admin";

/**
 * Is this path inside a section managers may open?
 *
 * Matched on path SEGMENTS. A plain `startsWith` would let "/admin/menu-prices"
 * through on the strength of "/admin/menu".
 */
export function managerCanAccess(pathname: string): boolean {
  const path = normalize(pathname);
  if ((MANAGER_EXACT as readonly string[]).includes(path)) return true;
  return MANAGER_SECTIONS.some((s) => path === s || path.startsWith(`${s}/`));
}

/** Trailing slashes and query strings are not part of the decision. */
function normalize(pathname: string): string {
  const path = (pathname.split("?")[0] || "").split("#")[0];
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/** Roles that reach the dashboard at all. */
export type DashboardRole = "admin" | "manager";

/** Can this role open this dashboard path? Owners go everywhere. */
export function dashboardCanAccess(role: DashboardRole, pathname: string): boolean {
  return role === "admin" || managerCanAccess(pathname);
}

/**
 * Filter the sidebar to what this role can open.
 *
 * Presentation only — the layout enforces the same rules on the way in. This
 * stops the sidebar offering a manager a dozen doors that bounce them, which
 * is what it did before: every Settings link was visible and none of them
 * worked.
 */
export function visibleAdminNav<T extends { items: { href: string }[] }>(
  role: DashboardRole,
  nav: readonly T[],
): T[] {
  if (role === "admin") return [...nav];
  return nav
    .map((section) => ({
      ...section,
      items: section.items.filter((i) => managerCanAccess(i.href)),
    }))
    .filter((section) => section.items.length > 0);
}
