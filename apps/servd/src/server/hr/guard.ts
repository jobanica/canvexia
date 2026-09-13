import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { hasModule } from "@/server/billing/entitlements";

/**
 * HRIS access: owner (admin) or manager, and the plan must include `hris`.
 * Returns { restaurantId, role, eligible } — pages render an upgrade prompt when
 * not eligible rather than redirecting.
 */
export async function requireHrPage() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || !["admin", "manager"].includes(user.role)) {
    redirect("/login");
  }
  const eligible = await hasModule(user.restaurantId, "hris");
  return { restaurantId: user.restaurantId, role: user.role, eligible };
}

export async function requireHrAction() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || !["admin", "manager"].includes(user.role)) {
    throw new Error("UNAUTHORIZED");
  }
  if (!(await hasModule(user.restaurantId, "hris"))) {
    throw new Error("Your plan doesn't include HRIS. Upgrade to enable it.");
  }
  return user;
}
