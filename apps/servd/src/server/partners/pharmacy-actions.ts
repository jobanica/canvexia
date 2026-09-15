"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPartner } from "@/server/partners/auth";
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
  const partner = await getCurrentPartner();
  if (!partner || partner.status !== "approved") {
    return { status: "error", message: "Your partner account isn't approved yet." };
  }

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
