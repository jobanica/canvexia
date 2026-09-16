"use server";

import { redirect } from "next/navigation";
import { requireWritablePartner } from "@/server/partners/auth";
import { startTopUp } from "./sms-topup";

export type TopUpState = { error?: string } | null;

/**
 * Buy credits.
 *
 * PARTNER ADMIN ONLY, and checked by ROLE rather than by a permission key. The
 * brief says "partner admin only for top-ups" and there is no key that means
 * "is an admin" — `settings.payout` is the payout card and `team.manage` is the
 * team. This spends the operator's own money, so the narrow reading is the
 * right one, and it is written here rather than left to the grid because the
 * grid cannot express it.
 *
 * `redirect()` throws by design in Next, so it is outside the try.
 */
export async function startTopUpAction(
  _prev: TopUpState,
  formData: FormData,
): Promise<TopUpState> {
  const who = await requireWritablePartner("settings.write");
  if (!who || who.partner.user.role !== "admin") {
    return { error: "Only the partner admin can buy credits." };
  }

  const credits = Number(formData.get("credits") ?? 0);
  const result = await startTopUp({
    partnerId: who.partnerId,
    credits,
    actorEmail: who.email,
  });
  if (!result.ok) return { error: result.message };

  // Straight to the gateway's hosted page. Nothing is credited here — the
  // signature-verified webhook does that, and only that.
  redirect(result.checkoutUrl);
}
