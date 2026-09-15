"use server";

import { revalidatePath } from "next/cache";
import { requireWritablePartner } from "@/server/partners/auth";
import { setPlanPrice } from "./revenue";

export type PricingState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

/**
 * Set a plan price.
 *
 * `revenue.pricing` is admin-only. The capability is re-checked here and not
 * only in the nav, because hiding a link is a courtesy and this is the gate.
 */
export async function setPlanPriceAction(
  _prev: PricingState,
  formData: FormData,
): Promise<PricingState> {
  const who = await requireWritablePartner("revenue.pricing");
  if (!who) {
    return { status: "error", message: "Only an approved admin can change pricing." };
  }
  const partner = who.partner;

  const planId = String(formData.get("planId") ?? "").trim();
  // Pesos in the form, centavos in the column. Parsed from digits only so a
  // typed "₱1,299" does not become NaN and then 0.
  const raw = String(formData.get("pricePesos") ?? "").replace(/[^\d]/g, "");
  if (!planId || !raw) return { status: "error", message: "Enter a price." };

  const result = await setPlanPrice(
    { partnerId: partner.id, email: partner.user.email },
    planId,
    Number(raw) * 100,
    formData.get("applyToExisting") === "on",
  );
  if (!result.ok) return { status: "error", message: result.message ?? "Could not save." };

  revalidatePath("/partner/revenue/pricing");
  return { status: "done", message: "Saved. New merchants get this price." };
}
