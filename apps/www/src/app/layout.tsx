import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

/**
 * Archivo for headlines, IBM Plex Sans for reading.
 *
 * Both are grotesques with real weight at display sizes and neither is the
 * default that every SaaS template ships with — the brief's "serious Filipino
 * company, not a US startup clone" is mostly typography and white space, since
 * there are no photographs to carry it.
 */
const display = Archivo({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
});

const body = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

const DESCRIPTION =
  "CANVEXIA builds software for Philippine local businesses. One partner per city sells it under their own brand and keeps 70% of every monthly subscription. No inventory, no store. Join the waitlist for your city.";

export const metadata: Metadata = {
  metadataBase: new URL("https://canvexia.com"),
  // `icon.svg` beside this file is the tab icon; this is the PNG iOS wants for
  // a home-screen bookmark. Without either, the browser fell back to
  // /favicon.ico — which this app does not have — and showed a blank page icon
  // on CANVEXIA's own front door.
  icons: {
    apple: "/brand/canvexia-180.png",
  },
  title: {
    default: "CANVEXIA — one city, one partner, your brand",
    template: "%s · CANVEXIA",
  },
  description: DESCRIPTION,
  keywords: [
    "software business Philippines",
    "negosyo without inventory",
    "software franchise Philippines",
    "city partner",
    "SaaS reseller Philippines",
  ],
  openGraph: {
    type: "website",
    locale: "en_PH",
    url: "https://canvexia.com",
    siteName: "CANVEXIA",
    title: "One city. One partner. Your brand, our software.",
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: "#FAFAF8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-PH" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
