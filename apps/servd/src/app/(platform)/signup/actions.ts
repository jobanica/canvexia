"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { systemDb } from "@/server/tenancy/scoped-db";
import { uniqueSlug } from "@/lib/slug";
import { provisionTrial } from "@/server/billing/subscription";
import { queueSignupEvent } from "@/server/agent-portal/signup-event";
import { flushOutboxQuietly } from "@/server/agent-portal/outbox";

export type SignupState = { ok?: boolean; error?: string } | null;

const schema = z.object({
  restaurantName: z.string().trim().min(2, "Restaurant name is required").max(80),
  ownerName: z.string().trim().min(2, "Your name is required").max(120),
  agentCode: z.string().trim().max(40).optional(),
  phone: z.string().trim().min(7, "Enter a valid phone number").max(30),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/**
 * Self-serve restaurant signup. Creates the Supabase Auth user (which triggers
 * the confirmation email) and provisions the tenant + first owner (role=admin).
 * The restaurant starts `active` so the owner can onboard immediately; login is
 * gated by Supabase until the email is confirmed.
 *
 * Agent era (D37): the restaurant is created on MANUAL billing (QR + receipt,
 * confirmed in the agent portal), and `customer.signed_up` is queued in the
 * same transaction — with the referral code if one was given — so the portal
 * learns of every signup exactly when it commits. The code is not checked
 * here: the portal decides whether it attaches, and a bad code never blocks
 * a signup.
 */
export async function signUpRestaurant(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const parsed = schema.safeParse({
    restaurantName: formData.get("restaurantName"),
    ownerName: formData.get("ownerName"),
    agentCode: formData.get("agentCode") || undefined,
    phone: formData.get("phone"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { restaurantName, ownerName, agentCode, phone, email, password } = parsed.data;

  try {
    const supabase = await createSupabaseServerClient();
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${base.replace(/\/$/, "")}/login` },
    });
    if (error) return { error: error.message };

    // Supabase obfuscates "already registered": a user with no identities.
    if (!data.user || (data.user.identities && data.user.identities.length === 0)) {
      return { error: "That email is already registered. Try logging in." };
    }
    const authUserId = data.user.id;

    try {
      await systemDb(async (tx) => {
        const slug = await uniqueSlug(restaurantName, async (s) => {
          const hit = await tx.restaurant.findUnique({ where: { slug: s }, select: { id: true } });
          return !!hit;
        });
        const restaurant = await tx.restaurant.create({
          data: {
            name: restaurantName,
            displayName: restaurantName,
            slug,
            status: "active",
            // Seed the contact phone — it also shows on printed receipts.
            printerConfig: { receipt: { phone } },
            staff: { create: { authUserId, role: "admin", email, displayName: ownerName } },
            billingMode: "manual",
          },
          select: { id: true },
        });
        // 30-day Business trial — every feature unlocked, no card.
        await provisionTrial(tx, restaurant.id);
        await queueSignupEvent(tx, {
          restaurantId: restaurant.id,
          businessName: restaurantName,
          ownerName,
          ownerPhone: phone,
          agentCode,
        });
      });
    } catch (e) {
      console.error("[signup] provisioning failed:", e);
      // Roll back the orphaned auth user so the email can be reused on retry.
      try {
        await createSupabaseAdminClient().auth.admin.deleteUser(authUserId);
      } catch (cleanup) {
        console.error("[signup] orphan cleanup failed:", cleanup);
      }
      return { error: "Couldn't create your restaurant. Please try again." };
    }

    await flushOutboxQuietly();
    return { ok: true };
  } catch (e) {
    // Never let the action crash into a 500 page — surface a friendly message.
    console.error("[signup] unexpected error:", e);
    return { error: "Something went wrong creating your account. Please try again." };
  }
}
