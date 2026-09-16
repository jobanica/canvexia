import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/offline/ServiceWorkerRegister";

/**
 * CANVEXIA HQ's own identity.
 *
 * The root layout is SERVD'S — its title, its manifest, its apple-touch-icon —
 * and every segment inherited it, so HQ and the partner portal both showed
 * Servd's "S" in the browser tab. One deployment serving two products means
 * the CANVEXIA surfaces have to say so themselves.
 *
 * `icon.svg` in this folder is the tab icon (Next's file convention); this
 * block covers the PNG one iOS needs, which has no file convention that can
 * override a parent's `icons.apple`.
 */
export const metadata: Metadata = {
  title: {
    default: "CANVEXIA HQ",
    template: "%s · CANVEXIA HQ",
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
  /**
   * HQ INSTALLS AS ITS OWN APP. Scope `/hq`, start_url `/hq`, and an `id` so
   * the browser keeps it distinct from the two CANVEXIA apps on `/partner`
   * that share this deployment.
   *
   * Without this block HQ inherited the root's `/manifest.webmanifest`, which
   * is SERVD'S — an ops admin who installed it got a Servd icon that opened
   * on a cashier till.
   */
  manifest: "/hq.webmanifest",
  appleWebApp: {
    capable: true,
    // What sits under the icon on an iPhone home screen. Inherited, it read
    // "Servd Orders".
    title: "CANVEXIA HQ",
    statusBarStyle: "default",
  },
  // HQ is internal tooling behind a login. It has no business in a search index.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#3B1E54",
  width: "device-width",
  initialScale: 1,
};

export default function HqLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/*
        Installability needs a service worker with a fetch handler controlling
        the start_url, so the manifest above is inert without this. `/sw.js` is
        served from the root, so its scope is `/` and it covers `/hq`.

        It is also what makes a half-loaded console survive a dropped
        connection, which matters less here than in the field but costs
        nothing.
      */}
      <ServiceWorkerRegister />
      {children}
    </>
  );
}
