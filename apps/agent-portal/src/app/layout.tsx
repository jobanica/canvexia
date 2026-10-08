import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

/** Absolute URLs for Open Graph. A bad or missing value falls back rather than failing the build. */
function siteUrl(): URL {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL ?? "");
  } catch {
    return new URL("https://agents.canvexia.com");
  }
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: "CANVEXIA Agents",
  description: "Refer businesses to CANVEXIA products and track your commission.",
  applicationName: "CANVEXIA Agents",
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: "/apple-touch-icon.png",
  },
  // iOS has no manifest support worth the name; this is what gives an added-to-
  // home-screen portal its own window instead of a Safari tab.
  appleWebApp: { capable: true, title: "CANVEXIA Agents", statusBarStyle: "black-translucent" },
};

// Agents use phones. Without this, mobile browsers render the desktop width
// and shrink it. `viewportFit` keeps the agent area's dark background under
// the notch rather than leaving a white band.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#6c5dbe",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
        <ServiceWorker />
        <Analytics />
      </body>
    </html>
  );
}
