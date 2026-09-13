"use server";

import { z } from "zod";
import { systemDb } from "@/server/tenancy/scoped-db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendPasswordSetEmail } from "@/server/email/transactional";

/**
 * One-time claim link handed to an owner after their DIY activation is paid.
 *
 * Activation creates the login with a random password nobody ever sees, so no
 * usable credential is stored or displayed anywhere. The owner opens
 * /claim/{token} once to set their own password (and optionally a real email),
 * and the token is cleared the moment they do.
 */

export interface ClaimTarget {
  restaurantName: string;
  username: string;
}

/** Resolve a claim token. Null once it's been used (or was never valid). */
export async function getClaim(token: string): Promise<ClaimTarget | null> {
  if (!token) return null;
  try {
    const r = await systemDb((tx) =>
      tx.restaurant.findFirst({
        where: { claimToken: token, claimedAt: null, status: "active" },
        select: {
          name: true,
          staff: {
            where: { role: "admin" },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { username: true },
          },
        },
      }),
    );
    const username = r?.staff[0]?.username;
    return r && username ? { restaurantName: r.name, username } : null;
  } catch {
    return null;
  }
}

const claimSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8, "Use at least 8 characters"),
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
});

export type ClaimState = { ok?: true; username?: string; error?: string } | null;

/** Set the owner's own password (and optional email), then burn the token. */
export async function submitClaim(_prev: ClaimState, formData: FormData): Promise<ClaimState> {
  const parsed = claimSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    email: formData.get("email") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const { token, password } = parsed.data;
  const email = parsed.data.email || "";

  const target = await systemDb((tx) =>
    tx.restaurant.findFirst({
      where: { claimToken: token, claimedAt: null, status: "active" },
      select: {
        id: true,
        staff: {
          where: { role: "admin" },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { id: true, authUserId: true, username: true },
        },
      },
    }),
  );
  const owner = target?.staff[0];
  if (!target || !owner?.authUserId) {
    return { error: "This link has already been used. Sign in with your username instead." };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(owner.authUserId, {
    password,
    ...(email ? { email, email_confirm: true } : {}),
  });
  if (error) {
    return {
      error: /registered|exists/i.test(error.message)
        ? "That email is already in use. Try another, or leave it blank."
        : "Couldn't save your password. Please try again.",
    };
  }

  await systemDb(async (tx) => {
    await tx.restaurant.update({
      where: { id: target.id },
      data: { claimToken: null, claimedAt: new Date() },
      select: { id: true },
    });
    if (email) {
      await tx.staffUser.update({ where: { id: owner.id }, data: { email }, select: { id: true } });
    }
  });

  // A record of the username they'll sign in with. Best-effort — the password
  // is already saved, so a mail failure changes nothing for them.
  await sendPasswordSetEmail(target.id);

  return { ok: true, username: owner.username ?? "" };
}
