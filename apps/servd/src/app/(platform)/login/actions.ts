"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { systemDb } from "@/server/tenancy/scoped-db";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { homeForAdmin } from "@/lib/platform/admin-scope";
import { MANAGER_HOME } from "@/lib/admin/manager-scope";

/** Resolve a login identifier to the auth email. Accepts an email OR a username. */
async function resolveEmail(identifier: string): Promise<string | null> {
  const id = identifier.trim();
  if (!id) return null;
  if (id.includes("@")) return id; // already an email
  try {
    const staff = await systemDb((tx) =>
      tx.staffUser.findFirst({ where: { username: id.toLowerCase() }, select: { email: true } }),
    );
    return staff?.email ?? null;
  } catch {
    return null; // username column not migrated yet
  }
}

/**
 * Staff/admin/super-admin sign-in. The identifier can be an email OR a username
 * (the super-admin can create accounts by username). Supabase verifies the
 * password and sets the session cookie; we route by role.
 */
export async function signIn(_prev: unknown, formData: FormData) {
  const identifier = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const email = await resolveEmail(identifier);
  if (!email) return { error: "Invalid email/username or password." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Invalid email/username or password." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: "No Servd account is linked to this login." };
  }

  // Straight to a section this admin can actually open. Landing everyone on
  // the overview would make the layout bounce a restricted one, and a redirect
  // out of a redirect renders blank until the page is reloaded.
  if (user.kind === "super") redirect(homeForAdmin(user.role));
  if (user.role === "kitchen") redirect("/kitchen");
  if (user.role === "cashier") redirect("/cashier");
  if (user.role === "merchant") redirect("/merchant");
  if (user.role === "manager") redirect(MANAGER_HOME);
  redirect("/admin");
}

/**
 * Sign out THIS device only. Supabase defaults to a "global" sign-out, which
 * revokes every refresh token on the account — so signing out on the office
 * laptop would also kick the phone, the cashier tablet and the kitchen screen
 * out mid-shift. "local" ends just the current session's tokens.
 */
export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}

/** Sends a password-reset email. Always reports success (no account enumeration). */
export async function requestPasswordReset(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };
  const supabase = await createSupabaseServerClient();
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  try {
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${base}/reset-password` });
  } catch {
    /* ignore — still report success */
  }
  return { ok: true };
}
