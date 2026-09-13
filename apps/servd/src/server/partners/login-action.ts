"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LoginState = { error?: string } | null;

/** Partner portal login (Supabase password auth). */
export async function loginPartner(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect("/partner");
}

/** Sign the partner out on THIS device only (see signOut in login/actions). */
export async function signOutPartner(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/partner/login");
}

export type ResetState = { ok?: boolean; error?: string } | null;

/**
 * Send a partner a password-reset email. Reuses the shared /reset-password page
 * but routes them back to the partner login afterwards. Always reports success
 * (no account enumeration).
 */
export async function requestPartnerPasswordReset(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };
  const supabase = await createSupabaseServerClient();
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  try {
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${base}/reset-password?next=${encodeURIComponent("/partner/login")}`,
    });
  } catch {
    /* ignore — still report success */
  }
  return { ok: true };
}
