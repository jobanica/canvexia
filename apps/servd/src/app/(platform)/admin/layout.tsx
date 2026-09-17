import type { Metadata } from "next";
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
 * THE DASHBOARD INSTALLS AS THE SHOP'S OWN APP.
 *
 * It had no manifest of its own, so it inherited the ROOT one — whose
 * `start_url` is `/cashier`. An owner who installed from their dashboard got an
 * app called "Servd", wearing Servd's orange tile, that opened on the till.
 * Every merchant's phone showed the same icon, and on a partner-sold shop it
 * was a competitor's brand.
 *
 * The manifest is per shop and keyed by the slug in its own path. That is
 * forced rather than chosen: a browser fetches a manifest WITHOUT credentials
 * unless the link sets `crossorigin="use-credentials"`, which Next's
 * `metadata.manifest` does not — so a session-derived manifest is not possible
 * and the identity has to be in the URL.
 *
 * ONE EXTRA QUERY, and only the columns the head needs. It runs in parallel
 * with the layout's own render rather than before it, so it costs a round trip
 * and not a wait.
 *
 * A visitor who is not staff gets nothing here. The page below renders bare and
 * its own guard redirects them; advertising an installable dashboard to
 * somebody who cannot open one would be worse than silence.
 */
export async function generateMetadata(): Promise<Metadata> {
  const user = await getCurrentUser().catch(() => null);
  if (!user || user.kind !== "staff") return {};

  const shop = await tenantDb(user.restaurantId, (tx) =>
    tx.restaurant.findFirstOrThrow({ select: { name: true, displayName: true, slug: true } }),
  ).catch(() => null);
  if (!shop?.slug) return {};

  const name = shop.displayName || shop.name;
  return {
    title: { default: `${name} — dashboard`, template: `%s · ${name}` },
    manifest: `/m/${shop.slug}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      // What sits under the icon on an iPhone home screen. Inherited, it read
      // "Servd".
      title: name,
      statusBarStyle: "default",
    },
    icons: {
      // iOS ignores the manifest entirely and reads this one link. It cannot
      // render the SVG monogram, so it gets Servd's PNG — the honest fallback
      // rather than a broken tile.
      apple: [{ url: "/brand/icon-apple-180.png", sizes: "180x180", type: "image/png" }],
    },
    // A back office behind a login has no business in a search index.
    robots: { index: false, follow: false },
  };
}

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
