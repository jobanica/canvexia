import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { dashboardCanAccess, MANAGER_HOME } from "@/lib/admin/manager-scope";
import { PATH_HEADER } from "@/lib/platform/admin-scope";

/**
 * Page guard: returns the logged-in restaurant admin, or redirects to /login.
 * Use at the top of admin pages (Server Components).
 *
 * When the restaurant is `suspended` (non-payment), this redirects to the
 * billing page so the owner can pay — unless `allowSuspended` is set (the
 * billing page itself passes that, so they don't get bounced in a loop).
 */
export async function requireAdminPage(opts?: { allowSuspended?: boolean }) {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || !["admin", "manager"].includes(user.role)) {
    redirect("/login");
  }

  // A manager runs the floor, not the business. Which pages that covers is
  // decided by path here rather than page by page, so a dashboard screen added
  // later is closed to them until somebody opens it deliberately.
  if (user.role === "manager") {
    const pathname = (await headers()).get(PATH_HEADER) ?? "";
    // No header means the middleware didn't run, so there is no path to judge.
    // Sign-in rather than the manager's home: refusing is the fail-closed
    // answer, and /login is the one target that can't bounce back here and
    // loop. In practice the middleware covers every dashboard route.
    if (!pathname) redirect("/login");
    if (!dashboardCanAccess("manager", pathname)) redirect(MANAGER_HOME);
  }
  if (!opts?.allowSuspended) {
    const r = await tenantDb(user.restaurantId, (tx) =>
      tx.restaurant.findFirstOrThrow({ select: { status: true } }),
    );
    // Only the owner can pay, and a manager can't open billing — sending them
    // there would bounce them straight back here and loop forever.
    if (r.status === "suspended") {
      redirect(user.role === "manager" ? "/suspended" : "/admin/billing");
    }
  }
  return user;
}

/**
 * Action guard: returns the admin, or throws. Server actions catch this and
 * surface a friendly error rather than redirecting mid-submit.
 */
/**
 * Action guard for work a manager may do: the menu, service, marketing and the
 * back office.
 *
 * Separate from requireAdminAction, and NOT decided by the request path. A
 * server action is reachable by its id from any page, so gating one on "which
 * screen was open" would let a manager invoke a settings action from a screen
 * they are allowed on. Each module states what it needs instead.
 */
export async function requireManagerAction() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || !["admin", "manager"].includes(user.role)) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

/** Action guard for owner-only work: pricing, billing, credentials, access. */
export async function requireAdminAction() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || user.role !== "admin") {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

/** Page guard: returns the platform super-admin, or redirects to /login. */
export async function requireSuperAdminPage() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "super") {
    redirect("/login");
  }
  return user;
}

/**
 * Action guard: returns the super-admin, or throws. Server actions catch this
 * and surface a friendly error rather than redirecting mid-submit.
 */
export async function requireSuperAdminAction() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "super") {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

/**
 * Action guard for the things only the founder may do: pricing, plans,
 * invoices, partner payouts, and anything that speaks to every customer at
 * once.
 *
 * Server actions are their own entry points — a POST reaches them whether or
 * not the sidebar offered a link — so hiding the page is not enough. The scope
 * has to be re-checked at the action, which is what this is for.
 */
export async function requireOwnerAction() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "super") {
    throw new Error("UNAUTHORIZED");
  }
  if (user.role !== "owner") {
    throw new Error("FORBIDDEN");
  }
  return user;
}
