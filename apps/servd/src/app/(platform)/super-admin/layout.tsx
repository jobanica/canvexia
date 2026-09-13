import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireSuperAdminPage } from "@/server/tenancy/require-admin";
import { SuperAdminShell } from "@/components/super-admin/SuperAdminShell";
import { canAccessPath, OPS_HOME, PATH_HEADER } from "@/lib/platform/admin-scope";

/**
 * Platform back-office chrome. Every /super-admin page runs in the trusted
 * system context and is gated to a platform admin.
 *
 * This layout is also the single gate for section-level scope. Doing it here
 * rather than page by page means a back-office section added later is covered
 * the moment it exists — the rules are fail-closed, so a new path is denied to
 * restricted roles until somebody deliberately opens it.
 */
export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperAdminPage();

  // Set by the middleware from the real URL; a browser can't forge it.
  const pathname = (await headers()).get(PATH_HEADER) ?? "";

  if (user.role !== "owner") {
    // No header means the middleware didn't run, so there is no path to judge.
    // Redirecting would loop — the redirect target would arrive header-less
    // too — so refuse in place instead. Fail-closed, and it can't spin.
    if (!pathname) {
      return (
        <SuperAdminShell role={user.role}>
          <p className="p-8 text-sm text-neutral-600">
            This section isn&apos;t available for your account.
          </p>
        </SuperAdminShell>
      );
    }
    if (!canAccessPath(user.role, pathname)) redirect(OPS_HOME);
  }

  return <SuperAdminShell role={user.role}>{children}</SuperAdminShell>;
}
