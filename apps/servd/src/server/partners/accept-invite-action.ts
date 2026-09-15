"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { acceptInvite } from "./accept-invite";

export type AcceptState = { error?: string } | null;

/**
 * Accept a staff invitation: create the login, create the seat, sign in.
 *
 * SIGNED IN RIGHT AFTER, not sent to the login screen. The person has just
 * typed the password they chose; making them type it again on another page is
 * the step where people decide the link is broken. The sign-in uses the normal
 * password flow — this action holds no session power of its own.
 *
 * `redirect()` throws by design in Next, so it is OUTSIDE the try: catching it
 * would turn a successful acceptance into "something went wrong".
 */
export async function acceptInviteAction(
  _prev: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const token = String(formData.get("token") ?? "");
  const name = String(formData.get("name") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password !== confirm) return { error: "Those two passwords don't match." };

  const result = await acceptInvite({ token, name, password });
  if (!result.ok) return { error: result.message };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: result.email,
    password,
  });
  // The seat exists either way. Sending them to the login page with their own
  // password in hand is a worse outcome than being signed in, not a broken one.
  if (error) redirect("/partner/login");

  redirect("/partner");
}
