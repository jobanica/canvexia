"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentUser } from "@/server/tenancy/current-user";
import { isMemberOf, canEnterBranch } from "@/server/tenancy/branches";
import { systemDb } from "@/server/tenancy/scoped-db";
import { uniqueSlug } from "@/lib/slug";
import { BRANCH_COOKIE, BRANCH_COOKIE_MAX_AGE } from "@/lib/tenancy/active-branch";
import { createBranchActivationCheckout } from "@/server/tenancy/branch-activation";

/**
 * Switch which branch the dashboard is showing.
 *
 * Membership is re-checked here rather than taken from the form: the value
 * arrives from the browser, and without the check anyone could type another
 * restaurant's id and read its takings. The cookie is httpOnly for the same
 * reason — nothing on the page needs to read it back.
 */
export async function switchBranch(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff") return;

  // Membership AND activated. A branch that hasn't been paid for has no
  // ordering and nothing to run — switching into it shows a dashboard that
  // can't do anything, which reads as the app being broken rather than as the
  // branch not being live yet.
  const restaurantId = String(formData.get("restaurantId") ?? "");
  if (!restaurantId || !(await canEnterBranch(user.authUserId, restaurantId))) return;

  (await cookies()).set(BRANCH_COOKIE, restaurantId, {
    maxAge: BRANCH_COOKIE_MAX_AGE,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  });

  // Everything on screen belongs to the branch they just left.
  redirect("/admin");
}

export type AddBranchState = { ok?: boolean; error?: string } | null;

const schema = z.object({
  name: z.string().trim().min(2, "Give the branch a name").max(80),
});

/**
 * Add a branch to this account.
 *
 * The branch is created immediately as `pending` — a real tenant with its own
 * menu, staff and takings — and the owner activates it the same way any account
 * activates. Created first, paid second, on purpose: a checkout that fails
 * halfway leaves a branch they can retry or delete, rather than money taken for
 * a restaurant that was never made.
 *
 * Only an admin can do this. A cashier adding shops to the business would be a
 * surprising amount of authority for someone who is there to ring up orders.
 */
export async function addBranch(
  _prev: AddBranchState,
  formData: FormData,
): Promise<AddBranchState> {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || user.role !== "admin") {
    return { error: "Only an owner can add a branch." };
  }
  const parsed = schema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid name" };

  let newId: string;
  try {
    newId = await systemDb(async (tx) => {
      // Carry the contact details across — a second branch of the same business
      // almost always shares them, and they're editable per branch afterwards.
      const source = await tx.restaurant.findUnique({
        where: { id: user.restaurantId },
        select: { printerConfig: true, planId: true },
      });

      const slug = await uniqueSlug(parsed.data.name, async (s) => {
        const hit = await tx.restaurant.findUnique({ where: { slug: s }, select: { id: true } });
        return !!hit;
      });

      const created = await tx.restaurant.create({
        data: {
          name: parsed.data.name,
          displayName: parsed.data.name,
          slug,
          status: "pending",
          planId: source?.planId ?? null,
          printerConfig: source?.printerConfig ?? undefined,
        },
        select: { id: true },
      });

      // The membership is what makes it part of this account.
      await tx.staffUser.create({
        data: {
          restaurantId: created.id,
          authUserId: user.authUserId,
          role: "admin",
          email: user.email,
        },
        select: { id: true },
      });

      return created.id;
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    // The one failure worth naming: the database still has the old global
    // unique index, so a second membership for this login can't be written.
    if (/authUserId/i.test(msg) || /unique/i.test(msg)) {
      return {
        error:
          "Branches aren't switched on for this database yet — run prisma/manual/add-multi-branch.sql, then try again.",
      };
    }
    return { error: "Couldn't create the branch. Please try again." };
  }

  // Deliberately NOT switched into: the branch isn't activated yet, and an
  // unactivated branch can't be entered. Setting the cookie here would point it
  // at a branch the session then refuses, quietly landing them somewhere else.
  void newId;
  return { ok: true };
}

export type ActivateBranchState = { error?: string } | null;

/**
 * Start the ₱499 Xendit checkout for one branch.
 *
 * Membership is re-checked here, not taken from the form — otherwise anyone
 * could post another restaurant's id and generate invoices against it.
 *
 * On success this REDIRECTS to Xendit rather than returning a URL for the
 * client to follow: a redirect throws, so there's no window where the action
 * has succeeded but the browser is still sitting on the branches page.
 */
export async function activateBranch(
  _prev: ActivateBranchState,
  formData: FormData,
): Promise<ActivateBranchState> {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || user.role !== "admin") {
    return { error: "Only an owner can activate a branch." };
  }
  const restaurantId = String(formData.get("restaurantId") ?? "");
  if (!restaurantId || !(await isMemberOf(user.authUserId, restaurantId))) {
    return { error: "Branch not found." };
  }

  const res = await createBranchActivationCheckout(restaurantId);
  if (!res.ok) return { error: res.error };
  redirect(res.checkout.checkoutUrl);
}
