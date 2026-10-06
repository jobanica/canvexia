import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { parseHost } from "@/lib/host";
import { readUtmParams, encodeUtm, UTM_COOKIE, UTM_MAX_AGE } from "@/lib/utm";
import { PATH_HEADER } from "@/lib/platform/admin-scope";
import { REF_COOKIE, REF_COOKIE_OPTIONS, refFromSearchParams } from "@servd/core/agent-kit/ref";

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
 * Agent referral (D37): ?ref=CODE into a 30-day cookie, so a restaurant owner
 * who opens an agent's link today and signs up next week is still credited to
 * that agent. Only a well-formed code is stored, and only when the URL carries
 * one — a plain reload never erases it. The signup page reads it back to
 * prefill the code; the agent portal decides whether it attaches.
 */
function captureRef(req: NextRequest, res: NextResponse): NextResponse {
  const code = refFromSearchParams(req.nextUrl.searchParams);
  if (code) res.cookies.set(REF_COOKIE, code, REF_COOKIE_OPTIONS);
  return res;
}

/** Click attribution, applied to whatever response we're sending. */
function captureAttribution(req: NextRequest, res: NextResponse): NextResponse {
  return captureRef(req, captureUtm(req, res));
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

  // The partner portal is retired (D38). Its hosts — CANVEXIA's own domain and
  // any partner subdomain — no longer serve anything from this app: they
  // redirect to the agent portal, where sales now live. Kept as an explicit
  // branch rather than deleted, because without it a partner host would fall
  // through to the tenant rewrite below and be looked up as a restaurant.
  if (info.kind === "partner" || info.kind === "partner_root") {
    const target = process.env.AGENT_PORTAL_URL?.trim();
    if (target) return NextResponse.redirect(new URL("/", target), 308);
    return new NextResponse("This address is no longer in use.", { status: 410 });
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
