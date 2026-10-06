"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/server/auth";
import { activeAgentAgreement, createApplication } from "@/server/agents";
import { parseApplication } from "@/lib/application";
import { formStrings, type FormState } from "@/lib/form-state";

const Credentials = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

/**
 * Apply to be an agent.
 *
 * Signed in already (say, as a Servd owner on the same Supabase project): the
 * application attaches to that login. Not signed in: a Supabase account is
 * created first, which sends the confirmation email, and is deleted again if
 * the agent row cannot be written — the same rollback Servd's signup does, so
 * a failed application does not burn the email address.
 */
export async function applyAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const form = formStrings(fd);
  const parsed = parseApplication(form);
  if (!parsed.ok) return { status: "error", message: parsed.error };

  const agreement = await activeAgentAgreement();
  if (!agreement) {
    return { status: "error", message: "Applications are closed right now. Please try again later." };
  }
  if (agreement.version !== parsed.agreementVersion) {
    return {
      status: "error",
      message: "The agent agreement was updated while you were reading it. Reload the page and review it again.",
    };
  }

  let user = await getAuthUser();
  let createdUserId: string | null = null;
  if (!user) {
    const creds = Credentials.safeParse({ email: form.email, password: form.password });
    if (!creds.success) return { status: "error", message: creds.error.issues[0].message };
    const supabase = await createSupabaseServerClient();
    const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002").replace(/\/$/, "");
    const { data, error } = await supabase.auth.signUp({
      ...creds.data,
      options: { emailRedirectTo: `${base}/login` },
    });
    if (error) return { status: "error", message: error.message };
    // Supabase hides "already registered" as a user with no identities.
    if (!data.user || (data.user.identities && data.user.identities.length === 0)) {
      return {
        status: "error",
        message: "That email already has an account. Sign in first, then apply from this page.",
      };
    }
    user = { id: data.user.id, email: creds.data.email };
    createdUserId = data.user.id;
  }

  try {
    const result = await createApplication(user, parsed.input, agreement.version);
    if (!result.ok) return { status: "error", message: result.error };
  } catch (e) {
    console.error("[apply] failed:", e);
    if (createdUserId) {
      await createSupabaseAdminClient()
        .auth.admin.deleteUser(createdUserId)
        .catch((cleanup) => console.error("[apply] orphan cleanup failed:", cleanup));
    }
    return { status: "error", message: "Could not submit your application. Please try again." };
  }

  return {
    status: "done",
    message: createdUserId
      ? "Application received. Confirm your email, then sign in. We'll review your application and activate your code."
      : "Application received. We'll review it and activate your code.",
  };
}
