import type { Metadata } from "next";

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
  // HQ is internal tooling behind a login. It has no business in a search index.
  robots: { index: false, follow: false },
};

export default function HqLayout({ children }: { children: React.ReactNode }) {
  return children;
}
