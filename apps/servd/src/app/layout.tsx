import type { Metadata } from "next";
import { Outfit, Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import "@/styles/globals.css";

// Outfit = wordmark + headings (700–800). Inter = UI/body. Loaded once here and
// exposed as CSS variables the design tokens reference.
const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-outfit",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Servd — QR ordering for restaurants",
  description:
    "Scan, order, pay. A QR-based ordering platform for restaurants.",
  manifest: "/manifest.webmanifest",
  // iOS home-screen (PWA) support — makes "Add to Home Screen" launch full-screen
  // (standalone) and gives it an app icon, matching the Android install. Web Push
  // on iOS 16.4+ also requires the app to be added to the home screen this way.
  appleWebApp: {
    capable: true,
    title: "Servd Orders",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/brand/icon-apple-180.png",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${outfit.variable} ${inter.variable}`}>
      <body>
        {/* Messages are provided to client components; server components use
            getTranslations directly. */}
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
