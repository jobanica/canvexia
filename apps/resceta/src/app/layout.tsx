import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: {
    default: "Resceta — pharmacy management",
    template: "%s · Resceta",
  },
  description:
    "Pharmacy POS, batch inventory and expiry tracking for Philippine pharmacies.",

  /**
   * INSTALLABLE. A pharmacy counter runs on a phone or a cheap tablet propped
   * next to the till, all day, on one bar of signal — the same argument that
   * made the field app installable, and stronger here because this screen is
   * somebody's whole shift.
   */
  manifest: "/manifest.webmanifest",
  icons: {
    // The tab icon stays the flat SVG: a browser tab is 16px of chrome and a
    // dark tile there is a smudge.
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/icon.svg", type: "image/svg+xml" }],
    // iOS ignores the manifest entirely and reads this. Without it a home
    // screen install gets a screenshot of the page instead of an icon.
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    // What sits under the icon on an iPhone home screen.
    title: "Resceta",
    statusBarStyle: "default",
  },
  // Staff software behind a login. It has no business in a search index.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#14111f",
  width: "device-width",
  initialScale: 1,
  /*
    ZOOM IS NOT DISABLED. This screen carries drug names, strengths and expiry
    dates that somebody reads under a fluorescent tube at the end of a shift.
    Taking pinch-zoom away to make it feel more like an app is the wrong trade
    in a pharmacy.
  */
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
            {/*
        A SOLID DARK BASE, not the shell's gradient. The gradient lives on
        `.app-shell` so the three surfaces that must stay light — the receipt
        print pages and the public shop page — can paint over a plain colour
        instead of having to undo a background image.
      */}
      <body className="min-h-screen bg-[#14111f] text-slate-100 antialiased">
        {/*
          A manifest alone makes nothing installable — the browser also wants a
          service worker with a fetch handler controlling the start_url. It is
          registered at the root because the scope is the whole app: an
          installed Resceta that dropped the user into a browser tab the moment
          they tapped through to a receipt would be worse than no install.
        */}
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
