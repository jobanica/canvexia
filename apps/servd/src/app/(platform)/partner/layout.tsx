import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/offline/ServiceWorkerRegister";

/**
 * The partner portal wears CANVEXIA's brand, not Servd's.
 *
 * One class, defined in styles/globals.css, which overrides the five
 * `--brand-*` variables the whole design system already reads. The background
 * and text are restated here because the platform layout above sets Servd's
 * `bg-brand-surface text-brand-ink` as literal colours, and a variable cannot override a
 * hex someone else already wrote.
 *
 * Applies to every route under /partner — login, forgot-password, apply, the
 * dashboard and the brand editor — so there is no page left to forget.
 *
 * THE ICONS ARE PART OF THAT. The root layout is Servd's, so without this the
 * portal served Servd's "S" in the tab and on an operator's home screen — a
 * partner installing the field app got a competitor product's logo. `icon.svg`
 * beside this file is the tab icon; `icons.apple` below is the one iOS uses,
 * which has no file convention that overrides a parent's.
 */
export const metadata: Metadata = {
  title: {
    default: "CANVEXIA",
    template: "%s · CANVEXIA",
  },
  icons: {
    // DECLARED IN FULL, not left to the `icon.svg` file convention. Declaring
    // `icons` at all suppresses the sibling file for this segment — which is
    // how the tab kept showing the root's Servd favicon.ico while the
    // apple-touch-icon was already CANVEXIA's.
    icon: [{ url: "/brand/canvexia-mark.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/brand/canvexia-mark.svg", type: "image/svg+xml" }],
    apple: "/brand/canvexia-180.png",
  },
  appleWebApp: {
    capable: true,
    // What shows under the icon when a partner adds it to their home screen.
    title: "CANVEXIA",
    statusBarStyle: "default",
  },
  /**
   * THE PORTAL'S manifest, not the field app's.
   *
   * This used to point at `/partner-field.webmanifest`, whose start_url is
   * `/partner/attendance`. Since this layout covers every partner route, an
   * operator admin who installed from the pipeline or the merchant list got an
   * app that opened on the staff check-in screen — the one page of the portal
   * they never use.
   *
   * So there are two apps on `/partner`, and the `id` in each manifest is what
   * keeps the browser from treating them as one:
   *   /partner.webmanifest        — the portal, opens on the Overview;
   *   /partner-field.webmanifest  — Field, opens on check-in, declared by
   *                                 attendance/layout.tsx, which overrides this.
   *
   * Both are scoped to `/partner`, so neither kicks the user into a browser tab
   * when they tap through to the other's pages.
   */
  manifest: "/partner.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#3B1E54",
  width: "device-width",
  initialScale: 1,
};
export default function PartnerBrandLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="brand-canvexia min-h-screen bg-brand-surface text-brand-ink">
      {/*
        A manifest alone makes nothing installable — the browser also wants a
        service worker with a fetch handler controlling the start_url. It was
        registered only under /partner/attendance, which is why the portal
        itself could never be installed. `/sw.js` is served from the root, so
        one registration covers both apps; registering it again from the field
        layout is a no-op.
      */}
      <ServiceWorkerRegister />
      {children}
    </div>
  );
}
