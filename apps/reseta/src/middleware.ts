import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Keeps staff signed in.
 *
 * Supabase access tokens are short-lived and have to be swapped for a fresh one
 * using the refresh token. Server Components cannot write cookies, so without
 * doing it here the session quietly dies once the access token expires — the
 * app looks like it "signed itself out" while it was only sitting open. On a
 * pharmacy counter that is the whole shift.
 *
 * Deliberately NO database work and no route gating. This runs on the Edge, and
 * a middleware that decides who may see what needs the membership rows, which
 * means Prisma, which does not belong here. Gating is done where the rows are:
 * `requireStaff()` in the layouts and actions. Middleware renews the token;
 * that is all.
 *
 * `getUser()` rather than `getSession()`: getSession trusts whatever is in the
 * cookie, which is exactly the thing a browser controls.
 */

type PendingCookie = { name: string; value: string; options?: Record<string, unknown> };

export async function middleware(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();

  // Only talk to Supabase when this request actually carries a session. An
  // anonymous hit on /login should not cost a round-trip.
  const hasSession = req.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  if (!hasSession) return NextResponse.next();

  const pending: PendingCookie[] = [];
  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list: PendingCookie[]) => {
          for (const c of list) {
            // Mutated so the CURRENT request already sees the fresh token,
            // not just the next one.
            req.cookies.set(c.name, c.value);
            pending.push(c);
          }
        },
      },
    });
    await supabase.auth.getUser();
  } catch {
    // Supabase unreachable — keep serving with the cookies we already have
    // rather than bouncing someone mid-sale to /login.
    return NextResponse.next();
  }

  const res = NextResponse.next({ request: { headers: req.headers } });
  for (const c of pending) res.cookies.set(c.name, c.value, c.options);
  return res;
}

export const config = {
  // Skip Next internals, API routes and static files.
  matcher: ["/((?!_next/|api/|.*\\..*).*)"],
};
