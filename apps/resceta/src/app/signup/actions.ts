"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { signUpPharmacy } from "@/server/agent-portal/self-signup";
import { flushOutboxQuietly } from "@/server/agent-portal/outbox";
import { rateLimit } from "@/server/rate-limit";

export type SignupState = { status: "idle" } | { status: "error"; message: string } | { status: "done" };

const Schema = z.object({
  pharmacyName: z.string().trim().min(2, "Enter the pharmacy's name.").max(120),
  ownerName: z.string().trim().min(2, "Enter your name.").max(120),
  phone: z.string().trim().min(7, "Enter a phone number.").max(30),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  agentCode: z.string().trim().max(40).optional(),
});

/**
 * Self-serve pharmacy signup (D37). Supabase account first, then the pharmacy
 * and owner in one transaction; the account is deleted again if that fails so
 * the email can be reused.
 */
export async function signUpAction(_prev: SignupState, fd: FormData): Promise<SignupState> {
  if (!(await rateLimit("resceta:signup"))) return { status: "error", message: "Too many attempts. Try again later." };
  const parsed = Schema.safeParse({
    pharmacyName: fd.get("pharmacyName"),
    ownerName: fd.get("ownerName"),
    phone: fd.get("phone"),
    email: fd.get("email"),
    password: fd.get("password"),
    agentCode: fd.get("agentCode") || undefined,
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001").replace(/\/$/, "");
  const { data, error } = await supabase.auth.signUp({
    email: d.email,
    password: d.password,
    options: { emailRedirectTo: `${base}/login` },
  });
  if (error) return { status: "error", message: error.message };
  if (!data.user || (data.user.identities && data.user.identities.length === 0)) {
    return { status: "error", message: "That email already has an account. Sign in instead." };
  }
  const authUserId = data.user.id;

  try {
    const r = await signUpPharmacy({
      authUserId,
      email: d.email,
      pharmacyName: d.pharmacyName,
      ownerName: d.ownerName,
      phone: d.phone,
      agentCode: d.agentCode ?? null,
    });
    if (!r.ok) {
      await createSupabaseAdminClient().auth.admin.deleteUser(authUserId).catch(() => {});
      return { status: "error", message: r.error };
    }
  } catch (e) {
    console.error("[signup] provisioning failed:", e);
    await createSupabaseAdminClient().auth.admin.deleteUser(authUserId).catch(() => {});
    return { status: "error", message: "Couldn't create your pharmacy. Please try again." };
  }
  await flushOutboxQuietly();
  return { status: "done" };
}
