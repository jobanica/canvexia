/**
 * What a back-office login is allowed to reach.
 *
 * Until now /super-admin was one binary door: hold a platform_admins row and
 * you could change what Servd charges, read every restaurant's data, and email
 * all of them. That is the right level of trust for the founder and the wrong
 * level for somebody hired to work the pipeline.
 *
 * Pure and table-driven so the rules can be read in one place and tested
 * without a session. The guard that uses them is in the /super-admin layout.
 */

/**
 * `owner` is everything — the founder. Stored as NULL in the database so every
 * admin that existed before this file keeps full access without a data
 * migration; only a row that explicitly says "ops" is restricted.
 */
export type AdminRole = "owner" | "ops";

/**
 * Request header the middleware stamps with the real pathname, so the
 * /super-admin layout can gate by section. The middleware overwrites any
 * incoming value, so a browser cannot set it to something permissive.
 */
export const PATH_HEADER = "x-servd-path";

export function parseAdminRole(raw: string | null | undefined): AdminRole {
  return raw === "ops" ? "ops" : "owner";
}

/**
 * Sections an ops admin may open, as path prefixes.
 *
 * Everything not listed is denied. Fail-closed is the whole point: a new
 * back-office section added next month must not quietly become visible to
 * staff because somebody forgot to update a deny-list.
 */
export const OPS_SECTIONS = [
  "/super-admin/bizops", // overview, follow-ups, usage, upsells, analytics
  "/super-admin/accounts", // creating a business
  "/super-admin/storefronts", // demo storefronts
  "/super-admin/subscriptions",
  "/super-admin/crm", // the lead records the follow-up list points at
] as const;

/** Where an ops admin lands, and where they're sent when they overreach. */
export const OPS_HOME = "/super-admin/bizops";

/** The platform overview. Full access only — it totals the whole business. */
export const OWNER_HOME = "/super-admin";

/**
 * Where to send an admin after they sign in.
 *
 * Landing everyone on the overview and letting the layout bounce the ones who
 * can't see it produces a redirect chained out of the sign-in action's own
 * redirect, and the browser renders that as a blank page until it's reloaded.
 * Sending each role somewhere it's actually allowed avoids the second hop —
 * and is the honest behaviour regardless of what it renders.
 */
export function homeForAdmin(role: AdminRole): string {
  return role === "ops" ? OPS_HOME : OWNER_HOME;
}

/**
 * Is this path inside one of the allowed sections?
 *
 * Prefix matching is done on path SEGMENTS. A plain `startsWith` would let
 * "/super-admin/accounts-billing" through on the strength of
 * "/super-admin/accounts", which is exactly the kind of near-miss that turns a
 * deny into an allow.
 */
export function canAccessPath(role: AdminRole, pathname: string): boolean {
  if (role === "owner") return true;

  const path = normalize(pathname);
  return OPS_SECTIONS.some((s) => path === s || path.startsWith(`${s}/`));
}

/** Trailing slashes and query strings are not part of the decision. */
function normalize(pathname: string): string {
  const path = (pathname.split("?")[0] || "").split("#")[0];
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/**
 * Filter a nav list down to what this role can open.
 *
 * The sidebar hides what it can't reach rather than showing links that bounce.
 * This is presentation only — hiding a link is not access control, and the
 * layout guard enforces the same rules on the way in.
 */
export function visibleNav<T extends { href: string }>(role: AdminRole, nav: readonly T[]): T[] {
  if (role === "owner") return [...nav];
  return nav.filter((item) => canAccessPath(role, item.href));
}
