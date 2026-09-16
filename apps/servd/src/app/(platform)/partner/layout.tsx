import type { Metadata } from "next";

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
    apple: "/brand/canvexia-180.png",
  },
  appleWebApp: {
    capable: true,
    // What shows under the icon when a partner adds it to their home screen.
    title: "CANVEXIA",
    statusBarStyle: "default",
  },
  manifest: "/partner-field.webmanifest",
};
export default function PartnerBrandLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="brand-canvexia min-h-screen bg-brand-surface text-brand-ink">
      {children}
    </div>
  );
}
