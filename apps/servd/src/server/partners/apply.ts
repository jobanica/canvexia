"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { systemDb } from "@/server/tenancy/scoped-db";

export type ApplyState = { ok?: boolean; error?: string } | null;

const schema = z.object({
  name: z.string().trim().min(2, "Your name is required").max(120),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/**
 * Partner application. Creates a Supabase auth user (so the partner can log
 * into the portal once approved) and a `pending` partner row. Super-admin
 * approves before the portal opens.
 *
 * It used to also ask for a payout method, bank/GCash details and a TIN,
 * because Servd paid partners a commission and needed somewhere to send it.
 * Servd pays them nothing now — a partner bills the restaurants they set up
 * directly — so asking for an account number would be collecting a sensitive
 * detail that nothing will ever use. The columns stay for the rows that already
 * have them; new applications simply leave them null.
 *
 * Every partner is a reseller now, for the same reason: "affiliate" meant
 * somebody who referred a restaurant and earned a percentage, and that isn't a
 * thing any more.
 */
export async function applyAsPartner(_prev: ApplyState, formData: FormData): Promise<ApplyState> {
  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const v = parsed.data;

  try {
    const supabase = await createSupabaseServerClient();
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const { data, error } = await supabase.auth.signUp({
      email: v.email,
      password: v.password,
      options: { emailRedirectTo: `${base.replace(/\/$/, "")}/partner/login` },
    });
    if (error) return { error: error.message };
    if (!data.user || (data.user.identities && data.user.identities.length === 0)) {
      return { error: "That email is already registered. Try logging in." };
    }
    const authUserId = data.user.id;

    try {
      await systemDb((tx) =>
        tx.partner.create({
          data: {
            authUserId,
            name: v.name,
            email: v.email,
            tier: "reseller",
            status: "pending",
          },
        }),
      );
    } catch (e) {
      // Roll back the orphan auth user so the email can be reused.
      try {
        await createSupabaseAdminClient().auth.admin.deleteUser(authUserId);
      } catch {
        /* ignore cleanup failure */
      }
      const msg = e instanceof Error && /Unique|email/i.test(e.message)
        ? "An application with that email already exists."
        : "Couldn't submit your application. Please try again.";
      return { error: msg };
    }

    return { ok: true };
  } catch {
    return { error: "Something went wrong. Please try again." };
  }
}
