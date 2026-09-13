import { NextRequest } from "next/server";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { hasModule } from "@/server/billing/entitlements";
import { signClockPhoto } from "@/server/storage/clock-photos";

/** Redirects to a short-lived signed URL for a clock-in/out selfie (admin/manager). */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || !["admin", "manager"].includes(user.role)) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!(await hasModule(user.restaurantId, "hris"))) {
    return new Response("Forbidden", { status: 403 });
  }
  const path = req.nextUrl.searchParams.get("path") ?? "";
  // Only allow paths inside the caller's restaurant.
  if (!path.startsWith(`${user.restaurantId}/`)) {
    return new Response("Not found", { status: 404 });
  }
  const url = await signClockPhoto(path);
  if (!url) return new Response("Not found", { status: 404 });
  return Response.redirect(url, 302);
}
