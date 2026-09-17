import { getCurrentUser } from "@/server/tenancy/current-user";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { getEntitledFeatures } from "@/server/billing/feature-gate";
import { hasTutorials } from "@/server/tutorials/tutorials";
import { AdminShell } from "@/components/admin/AdminShell";
import { getMerchantFacingBrand } from "@/server/branding/partner-brand";
import { listBranches } from "@/server/tenancy/branches";
import { unreadCount } from "@/server/announcements/queries";
import { listMyFeedback, unreadReplyCount } from "@/server/platform-feedback/queries";

/**
 * Dashboard chrome for the restaurant back-office. Wraps every /admin page in
 * the sidebar shell. If the visitor isn't an admin/manager, we render the page
 * bare and let its own guard handle the redirect to /login.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || !["admin", "manager"].includes(user.role)) {
    return <>{children}</>;
  }

  /**
   * THE PARTNER WHO SOLD THEM THIS, resolved for the chrome.
   *
   * `getMerchantFacingBrand` has existed since the branding work and had no
   * callers, which is why a partner-sold shop's dashboard still said "Powered
   * by Servd" and pointed at Servd for help. Best-effort by construction — it
   * falls back to the platform's own brand on any failure, so a lookup can
   * never be the reason a dashboard does not render.
   */
  const [restaurant, features, tutorialsReady, vendor] = await Promise.all([
    tenantDb(user.restaurantId, (tx) =>
      tx.restaurant.findFirstOrThrow({
        select: {
          name: true,
          displayName: true,
          slug: true,
          status: true,
          logoUrl: true,
          brandPrimaryColor: true,
          brandAccentColor: true,
        },
      }),
    ),
    getEntitledFeatures(user.restaurantId),
    hasTutorials(),
    getMerchantFacingBrand(user.restaurantId),
  ]);
  // Only an owner with more than one shop sees a switcher; for everyone else
  // this is one cheap query that resolves to a single row.
  const branches = await listBranches(user.authUserId, user.restaurantId);
  // Best-effort by construction — unreadCount returns 0 rather than throwing,
  // so a notice badge can never be the reason a dashboard fails to render.
  const unreadAnnouncements = await unreadCount(user.staffUserId);
  // What this restaurant has written to Servd, and anything written back. Both
  // return empty/zero on any failure, so the dashboard can't fail over a reply.
  const [feedbackHistory, unreadFeedbackReplies] = await Promise.all([
    listMyFeedback(user.restaurantId),
    unreadReplyCount(user.restaurantId),
  ]);

  return (
    <AdminShell
      brand={{
        name: restaurant.displayName || restaurant.name,
        slug: restaurant.slug,
        status: restaurant.status,
        logoUrl: restaurant.logoUrl,
      }}
      vendor={{
        displayName: vendor.displayName ?? null,
        logoUrl: vendor.logoUrl ?? null,
        supportEmail: vendor.supportEmail ?? null,
        supportPhone: vendor.supportPhone ?? null,
        supportUrl: vendor.supportUrl ?? null,
      }}
      theme={{
        brandPrimaryColor: restaurant.brandPrimaryColor,
        brandAccentColor: restaurant.brandAccentColor,
      }}
      // Full white-label (no "Powered by Servd") is now a per-plan feature.
      fullWhiteLabel={features.has("whiteLabel")}
      features={[...features]}
      showTutorials={tutorialsReady}
      branches={branches}
      unreadAnnouncements={unreadAnnouncements}
      feedbackHistory={feedbackHistory}
      unreadFeedbackReplies={unreadFeedbackReplies}
      role={user.role === "manager" ? "manager" : "admin"}
    >
      {children}
    </AdminShell>
  );
}
