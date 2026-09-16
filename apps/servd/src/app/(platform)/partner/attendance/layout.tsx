import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/offline/ServiceWorkerRegister";

/**
 * The field app. Its own manifest, so "Add to home screen" launches straight
 * into the check-in screen in standalone mode.
 *
 * PHONE-FIRST AND OFFLINE-TOLERANT because of where it is used: a salesperson
 * standing outside a carinderia in a street with one bar. The desktop version
 * works and is not the point.
 *
 * `scope` is `/partner`, not `/partner/attendance`: an installed app that
 * kicked the user out to a browser tab the moment they tapped through to a
 * merchant would be worse than no install at all.
 */
export const metadata: Metadata = {
  title: "Field — CANVEXIA",
  manifest: "/partner-field.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Field" },
  /**
   * CANVEXIA'S MARK, not Servd's.
   *
   * These two lines pointed at `/brand/icon-192.png` and
   * `/brand/icon-apple-180.png` — Servd's icons — so a salesperson who added
   * the field app to their home screen got a competitor product's logo sitting
   * on their phone. The manifest above had already been switched to the
   * CANVEXIA set; this block, which overrides it for the tab and for iOS, had
   * not.
   */
  icons: {
    icon: [{ url: "/brand/canvexia-mark.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/brand/canvexia-mark.svg", type: "image/svg+xml" }],
    // Field's own near-black tile, for the same reason the portal has a purple
    // one: iOS reads this, not the manifest.
    apple: [{ url: "/brand/canvexia-field-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#3B1E54",
  width: "device-width",
  initialScale: 1,
  // Zoom is NOT disabled here, unlike the merchant kiosk. This screen carries
  // names, addresses and notes somebody reads in bright sunlight, and taking
  // pinch-zoom away from them to make it feel more like an app is the wrong
  // trade.
};

export default function FieldLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/*
        The parent /partner layout registers this too, now that the portal is
        installable in its own right. Kept here anyway: `register()` for the
        same script and scope returns the existing registration rather than
        making a second one, and this is the screen where losing the worker
        costs somebody a day's visits.
      */}
      <ServiceWorkerRegister />
      {children}
    </>
  );
}
