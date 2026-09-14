import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PHARMACY_COOKIE } from "@/lib/pharmacy/active-pharmacy";

/**
 * Sign out. POST only.
 *
 * A GET would let any page on the internet sign a pharmacist out mid-shift with
 * an <img src>. Not much of a security hole, but a real nuisance at a counter
 * with a queue.
 *
 * Clears the pharmacy cookie too: leaving it behind means the next person to
 * sign in on this till starts out pointed at the previous person's branch.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  const res = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  res.cookies.delete(PHARMACY_COOKIE);
  return res;
}
