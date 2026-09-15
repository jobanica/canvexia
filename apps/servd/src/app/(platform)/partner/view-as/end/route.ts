import { NextRequest, NextResponse } from "next/server";
import { endImpersonation } from "@/server/hq/impersonate";

/** End a "view as" session and go back to HQ. Clears the cookie, closes the row. */
export async function GET(req: NextRequest) {
  await endImpersonation();
  return NextResponse.redirect(new URL("/hq/partners", req.nextUrl.origin));
}
