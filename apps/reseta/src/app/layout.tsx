import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reseta — pharmacy management",
  description:
    "Pharmacy POS, batch inventory and expiry tracking for Philippine pharmacies.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
