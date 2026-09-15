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
  icons: {
    icon: [{ url: "/brand/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/brand/icon-apple-180.png", sizes: "180x180", type: "image/png" }],
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
      <ServiceWorkerRegister />
      {children}
    </>
  );
}
