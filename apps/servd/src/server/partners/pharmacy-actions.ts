"use server";

import { revalidatePath } from "next/cache";
import { requireWritablePartner } from "@/server/partners/auth";
import { activatePharmacy } from "@/server/partners/pharmacies";

export type ActivateState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

/**
 * A partner switching on a pharmacy they own.
 *
 * The partner comes from the session; the form carries only the pharmacy id,
 * and `activatePharmacy` scopes by both — so a forged id reaches a row the
 * policy will not return.
 */
export async function activatePharmacyAction(
  _prev: ActivateState,
  formData: FormData,
): Promise<ActivateState> {
  const who = await requireWritablePartner("merchants.manage");
  if (!who) {
    return { status: "error", message: "Your partner account can't activate a pharmacy." };
  }
  const partner = who.partner;

  const pharmacyId = String(formData.get("pharmacyId") ?? "").trim();
  if (!pharmacyId) {
    return { status: "error", message: "No pharmacy was selected." };
  }

  const outcome = await activatePharmacy({
    partnerId: partner.id,
    pharmacyId,
    actorEmail: partner.email,
  });
  if (!outcome.ok) return { status: "error", message: outcome.message };

  revalidatePath("/partner");
  return {
    status: "done",
    message: `${outcome.name} is active. It can dispense now.`,
  };
}
