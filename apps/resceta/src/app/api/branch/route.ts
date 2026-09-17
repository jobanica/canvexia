import { NextResponse } from "next/server";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { BRANCH_COOKIE, listBranches } from "@/server/pharmacy/branches";

/**
 * Switch the branch this browser is looking at.
 *
 * A POST AND A COOKIE, not a query parameter threaded through forty links. The
 * selection is a property of the person at the till, not of the page they
 * happen to be on — carrying it in the URL means every link that forgets it
 * silently switches them back.
 *
 * THE VALUE IS VALIDATED against the branches this pharmacy actually has, so a
 * hand-set cookie cannot name another pharmacy's branch. `branchContext` falls
 * back to the main branch for anything unrecognised anyway; this stops the bad
 * value being stored in the first place.
 */
export async function POST(request: Request) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ ok: false }, { status: 401 });

  const form = await request.formData();
  const value = String(form.get("branch") ?? "").trim();
  const back = String(form.get("back") ?? "/");

  let store = "";
  if (value === "all") {
    store = "all";
  } else {
    const branches = await listBranches(staff.pharmacyId);
    if (branches.some((b) => b.id === value && b.isActive)) store = value;
  }

  // Relative only: `back` arrives from the page and an absolute URL here would
  // be an open redirect.
  const target = back.startsWith("/") && !back.startsWith("//") ? back : "/";
  const res = NextResponse.redirect(new URL(target, request.url), 303);
  if (store) {
    res.cookies.set(BRANCH_COOKIE, store, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return res;
}
