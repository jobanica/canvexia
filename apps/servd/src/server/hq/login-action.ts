"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentHqUser, rateLimitHqLogin, recordHqLogin } from "./auth";

export type HqLoginState = { error?: string } | null;

/**
 * Sign in to the CANVEXIA HQ console.
 *
 * SEPARATE FROM SERVD'S STAFF LOGIN, and not only for the branding. That form
 * signs in restaurant cashiers and routes by their staff role; this one has a
 * single job and one extra check that matters: after Supabase accepts the
 * password, it confirms the person actually holds an HQ SEAT — and signs them
 * back out if they do not.
 *
 * Without that check, a merchant owner or a partner could type their own
 * credentials here, get a valid Supabase session, and land on a redirect loop
 * at /hq with a session they did not have before. Nothing would leak — every
 * /hq page calls requireHqPage() — but "your password worked and then nothing
 * happened" is the kind of thing somebody keeps trying.
 */
export async function loginHq(_prev: HqLoginState, formData: FormData): Promise<HqLoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  // Counted before the password is checked, so an attacker cannot get unlimited
  // attempts by supplying a wrong one. Fails CLOSED — see rateLimitHqLogin.
  const limit = await rateLimitHqLogin();
  if (!limit.ok) return { error: limit.error ?? "Too many attempts." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // The email as typed and the outcome — never the password. "Somebody tried
    // this address forty times" is what the log is for.
    await recordHqLogin(email, false);
    // Deliberately not the provider's message: "Invalid login credentials" and
    // "Email not confirmed" tell an attacker which addresses exist.
    return { error: "That email and password do not match an HQ account." };
  }

  const hq = await getCurrentHqUser();
  if (!hq) {
    await supabase.auth.signOut({ scope: "local" });
    await recordHqLogin(email, false);
    return {
      error:
        "That login is valid but has no HQ seat. Partners sign in at /partner/login; restaurant staff at /login.",
    };
  }

  await recordHqLogin(hq.email, true);
  redirect("/hq");
}

/** Sign out of HQ on THIS device only (see signOut in login/actions for why). */
export async function signOutHq(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/hq/login");
}
