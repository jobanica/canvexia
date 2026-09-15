import { NextRequest, NextResponse } from "next/server";
import { redeemImpersonationGrant } from "@/server/hq/impersonate";

/**
 * Redeem a "view as partner" grant and land in the portal.
 *
 * A ROUTE HANDLER, not a page, for one reason that matters: redemption SETS A
 * COOKIE and marks the grant used, and Next.js forbids setting a cookie while
 * rendering a page. A page that tried would either fail or — worse — silently
 * mark the grant used without the session existing, burning a single-use token
 * on nothing.
 *
 * GET, and that is a deliberate exception to "GET does not change state". The
 * link is opened from HQ by clicking it, and the alternative is a form POST
 * from a page that has already had to carry the token through a query string.
 * What makes it safe is that the token is single-use, 30 minutes old at most,
 * and does nothing at all without also being a valid grant row: a prefetch or a
 * scanner that follows it burns the grant and gets a read-only session for a
 * partner it cannot do anything to.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const result = await redeemImpersonationGrant(token);

  if (!result.ok) {
    const url = new URL("/hq/partners", _req.nextUrl.origin);
    url.searchParams.set("viewAsError", result.error);
    return NextResponse.redirect(url);
  }

  return NextResponse.redirect(new URL("/partner", _req.nextUrl.origin));
}
