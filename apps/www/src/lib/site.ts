/**
 * The two links that come from outside the code, and what happens without them.
 *
 * Each one is read as a literal, fully spelled-out reference below, because
 * Next inlines public variables at BUILD time — a computed lookup
 * (`process.env[name]`) returns undefined in the browser, which is the kind of
 * bug that only shows up in production.
 *
 * An unset booking URL hides the button rather than rendering one that goes
 * nowhere. A button that does nothing is worse than an absent one on a page
 * whose whole argument is "we are not wasting your time".
 */
const booking = process.env.NEXT_PUBLIC_BOOKING_URL?.trim() || "";
const portal = process.env.NEXT_PUBLIC_PORTAL_URL?.trim() || "";

export const SITE = {
  name: "CANVEXIA",
  legalName: "CANVEXIA Technologies",
  city: "Davao City, Philippines",
  email: "hello@canvexia.com",
  /** "" means: do not render the button. */
  bookingUrl: booking,
  /** Falls back to the stub page in this app until the portal is live. */
  portalUrl: portal || "/login",
  /** Servd's own site. NOT servdph.com — that is a different business (D31). */
  servdUrl: "https://servdph.net",
  partnerShare: 70,
  hqShare: 30,
} as const;

/** The partner portal lives on another host once NEXT_PUBLIC_PORTAL_URL is set. */
export const portalIsExternal = SITE.portalUrl.startsWith("http");
