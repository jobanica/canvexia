"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentHqUser, rateLimitHqLogin, recordHqLogin } from "./auth";
import { partnerUrl } from "@/lib/urls";

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

export type HqResetState = { ok?: boolean; error?: string } | null;

/**
 * SEND AN HQ ADMIN A RESET LINK.
 *
 * REPORTED — "in all the login details, add a show password and forgot
 * password." HQ's form had the Show toggle and no way back in at all: no link,
 * and no route behind one. An ops admin who forgot their password had exactly
 * one option, which was to ask somebody with database access.
 *
 * HQ seats ARE Supabase auth users — `loginHq` above signs in through
 * `signInWithPassword` — so this is the same mechanism the partner portal and
 * the staff dashboard already use, pointed at HQ's own sign-in page.
 *
 * IT REPORTS SUCCESS EITHER WAY, like the other two. Saying "no HQ account uses
 * that address" would turn this form into a way to enumerate who works here.
 * The rate limit on `loginHq` is what stops the guessing; this one just refuses
 * to answer the question.
 */
export async function requestHqPasswordReset(
  _prev: HqResetState,
  formData: FormData,
): Promise<HqResetState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };

  const supabase = await createSupabaseServerClient();
  try {
    await supabase.auth.resetPasswordForEmail(email, {
      // `/reset-password` is in the middleware's PASS_THROUGH list, so it
      // answers on a CANVEXIA host rather than being prefixed with /partner.
      redirectTo: `${partnerUrl()}/reset-password?next=${encodeURIComponent("/hq/login")}`,
    });
  } catch {
    /* ignore — still report success, for the reason above */
  }
  return { ok: true };
}
