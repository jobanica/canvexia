import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { parseHost } from "@/lib/host";
import { readUtmParams, encodeUtm, UTM_COOKIE, UTM_MAX_AGE } from "@/lib/utm";
import { PATH_HEADER } from "@/lib/platform/admin-scope";

/**
 * Host-based multi-tenant routing.
 *  - Platform hosts (servd.app, localhost, *.vercel.app) → served normally;
 *    direct access to the internal /sites segment is blocked.
 *  - Tenant hosts (a *.servd.app subdomain or a connected custom domain) →
 *    rewritten to app/sites/[host]/… which renders the white-label diner pages.
 *
 * It ALSO keeps the logged-in session alive (see refreshSession below).
 *
 * No DB calls here (Edge-safe): we route by host *shape*; the restaurant lookup
 * happens in the rewritten Node route.
 */
/**
 * Ad attribution: capture utm_* (or a bare fbclid) into a 90-day cookie the
 * builder later stamps onto the lead. Done here rather than in a client
 * component so it survives a visitor with JS still loading, and so the cookie
 * is httpOnly — nothing on the page needs to read it back.
 *
 * Deliberately only writes when the URL actually carries tags: a plain reload
 * of /create must not erase which ad brought them.
 */
function captureUtm(req: NextRequest, res: NextResponse): NextResponse {
  const utm = readUtmParams(req.nextUrl.searchParams);
  if (utm) {
    const value = encodeUtm(utm);
    if (value) {
      res.cookies.set(UTM_COOKIE, value, {
        maxAge: UTM_MAX_AGE,
        path: "/",
        httpOnly: true,
        sameSite: "lax",
      });
    }
  }
  return res;
}

/**
 * Click attribution, applied to whatever response we're sending.
 *
 * There used to be a second capture here — ?ref=CODE into a 30-day referral
 * cookie — which the referral program read to attribute a signup and accrue a
 * commission. There is no commission any more, so nothing reads it and it is
 * gone; only the ad tags are still worth keeping.
 */
function captureAttribution(req: NextRequest, res: NextResponse): NextResponse {
  return captureUtm(req, res);
}

type PendingCookie = { name: string; value: string; options?: Record<string, unknown> };

/**
 * Keeps staff signed in. Supabase access tokens are short-lived and have to be
 * swapped for a fresh one using the refresh token. Server Components can't
 * write cookies, so without doing it here the session quietly dies once the
 * access token expires — the app looks like it "auto signed out" while it was
 * just sitting open. Calling getUser() renews the token when needed and hands
 * back the cookies to write onto whatever response we send.
 *
 * Mutates req.cookies so the current request already sees the new token, and
 * returns the cookies to copy onto the response for the browser.
 */
async function refreshSession(req: NextRequest): Promise<PendingCookie[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  // Only talk to Supabase when this request actually carries a session — public
  // diner/storefront traffic skips the round-trip entirely.
  const hasSession = req.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  if (!hasSession) return [];

  const pending: PendingCookie[] = [];
  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list: PendingCookie[]) => {
          for (const c of list) {
            req.cookies.set(c.name, c.value);
            pending.push(c);
          }
        },
      },
    });
    await supabase.auth.getUser();
  } catch {
    /* Supabase unreachable — keep serving with the cookies we already have
       rather than bouncing the user to /login. */
  }
  return pending;
}

function withSession(res: NextResponse, cookies: PendingCookie[]): NextResponse {
  for (const c of cookies) res.cookies.set(c.name, c.value, c.options);
  return res;
}

/**
 * Paths that must NOT be prefixed with `/partner` on a partner host.
 *
 * THE RULE IS "ANYTHING AN EMAIL LINKS TO", plus the portal's own paths.
 *
 * Every link this codebase puts in an email is built from
 * `NEXT_PUBLIC_APP_URL`, and that variable now points at the portal host
 * (`partner.canvexia.com`). On that host the branch below prefixes `/partner`
 * onto everything it does not recognise — so an emailed link to a top-level
 * page resolves to `/partner/<that page>`, which does not exist, and the person
 * who clicked it gets a 404 with nothing to explain it.
 *
 * Each entry is a page a STRANGER reaches with no session:
 *
 *   /partner        the portal itself, so a redirect to /partner/login from
 *                   inside it does not become /partner/partner/login;
 *   /l/             a partner's public lead form — the one page a member of the
 *                   public sees;
 *   /invite/        a staff invitation. This is the link in every invitation
 *                   email, so getting it wrong means nobody can be onboarded —
 *                   the exact failure the invite route was built to fix;
 *   /reset-password the shared reset page. Partner resets link here rather than
 *                   to a /partner copy, which does not exist;
 *   /unsubscribe/   the unsubscribe link in marketing email. A broken one is
 *                   not a 404 somebody shrugs at — it is the link a recipient
 *                   uses to make you stop, and the fastest way to get a sending
 *                   domain blocked.
 *
 * ADDING A NEW EMAILED LINK MEANS ADDING IT HERE. `tests/host/emailed-links`
 * scans for link construction and fails if a path is missing from this list, so
 * the next one does not have to be found in production.
 */
export const PASS_THROUGH = [
  "/partner",
  "/l/",
  "/invite/",
  "/reset-password",
  "/unsubscribe/",
] as const;

/**
 * Paths that pass through on CANVEXIA's OWN host but not on an operator's.
 *
 * `/hq` is CANVEXIA's console. It belongs on a CANVEXIA address — configuring
 * CANVEXIA's own email should not mean signing into Servd's admin on a
 * `*.vercel.app` URL — and it does NOT belong on `davao.canvexia.com`, which is
 * an operator's own branded portal. Serving CANVEXIA's HQ login there would be
 * role-gated and harmless and still wrong: it is not their console.
 *
 * So this list is checked only for `partner_root`, never for `partner`.
 */
export const ROOT_ONLY_PASS_THROUGH = ["/hq"] as const;

export async function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  const { pathname, search } = req.nextUrl;

  // Public tutorials hub on its own subdomain (tutorials.<root>) → serve the
  // /tutorials route. Also reachable at <root>/tutorials directly.
  if (rootDomain && host === `tutorials.${rootDomain.toLowerCase()}`) {
    const rest = pathname === "/" ? "" : pathname;
    const url = new URL(`/tutorials${rest}${search}`, req.url);
    return captureAttribution(req, NextResponse.rewrite(url));
  }

  const info = parseHost(host, rootDomain, process.env.NEXT_PUBLIC_PARTNER_ROOT_DOMAIN);

  // A partner's own domain serves the partner portal, not a storefront.
  //
  // This branch has to exist before NEXT_PUBLIC_PARTNER_ROOT_DOMAIN is set, not
  // after: without it, the first partner host configured would fall through to
  // the tenant rewrite below and be looked up as a restaurant, which it is not.
  // Inert until that variable exists, because parseHost cannot return this kind
  // without it.
  // CANVEXIA's own domain: the bare root AND a partner's subdomain both serve
  // the portal, and the rewrite is identical — /partner is prefixed either way,
  // and which partner it is gets resolved from the host further down. The only
  // difference is that the root has no partner to resolve, which the portal
  // already handles by sending an unauthenticated visitor to /partner/login.
  if (info.kind === "partner" || info.kind === "partner_root") {
    const session = await refreshSession(req);
    const headers = new Headers(req.headers);
    headers.set(PATH_HEADER, pathname);
    const passes =
      PASS_THROUGH.some((prefix) => pathname.startsWith(prefix)) ||
      (info.kind === "partner_root" &&
        ROOT_ONLY_PASS_THROUGH.some((prefix) => pathname.startsWith(prefix)));
    const target = passes
      ? `${pathname}${search}`
      : `/partner${pathname === "/" ? "" : pathname}${search}`;
    return withSession(
      captureAttribution(
        req,
        NextResponse.rewrite(new URL(target, req.url), { request: { headers } }),
      ),
      session,
    );
  }

  if (info.kind === "platform") {
    if (pathname.startsWith("/sites")) {
      return new NextResponse("Not found", { status: 404 });
    }
    // Renew the session before rendering, so an expired access token is
    // refreshed instead of logging staff out mid-shift.
    const session = await refreshSession(req);
    // Layouts can't read the pathname, and the /super-admin layout is the one
    // place that gates back-office sections by role. Setting it here overwrites
    // anything the browser sent under the same name, so it can't be spoofed
    // into unlocking a section.
    const headers = new Headers(req.headers);
    headers.set(PATH_HEADER, pathname);
    return withSession(
      captureAttribution(req, NextResponse.next({ request: { headers } })),
      session,
    );
  }

  // Tenant host → rewrite to the internal sites segment.
  const rest = pathname === "/" ? "" : pathname;
  const url = new URL(`/sites/${host}${rest}${search}`, req.url);
  return captureAttribution(req, NextResponse.rewrite(url));
}

export const config = {
  // Skip Next internals, API routes, and static files.
  matcher: ["/((?!_next/|api/|.*\\..*).*)"],
};
