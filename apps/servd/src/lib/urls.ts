/**
 * Which address to put in a link, when one deployment serves two products.
 *
 * `apps/servd` answers on BOTH the merchant platform and CANVEXIA's partner
 * portal — the middleware reads the Host header and rewrites. That was
 * invisible while everything lived on one `*.vercel.app` host and became real
 * the day `partner.canvexia.com` was pointed here.
 *
 * ONE VARIABLE CANNOT BE BOTH. `NEXT_PUBLIC_APP_URL` builds a restaurant
 * owner's claim link and a partner's invitation link, and those belong on
 * different domains and different brands. Sending a restaurant owner to
 * CANVEXIA's partner domain is wrong even when it resolves — and on that host
 * it does not resolve, because every unrecognised path is prefixed with
 * `/partner`.
 *
 * So there are two:
 *
 *   platformUrl()  the merchant product — /claim, /login, /admin, storefronts.
 *   partnerUrl()   the partner portal   — /invite, the partner password reset.
 *
 * `partnerUrl()` FALLS BACK to the platform URL, so a deployment that has not
 * set it (every preview, and production before the domain existed) keeps
 * working exactly as it did.
 */

const LOCAL = "http://localhost:3000";

export function platformUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || LOCAL).replace(/\/$/, "");
}

export function partnerUrl(): string {
  return (
    process.env.NEXT_PUBLIC_PARTNER_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    LOCAL
  ).replace(/\/$/, "");
}
