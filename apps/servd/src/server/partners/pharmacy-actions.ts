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
  /**
   * `merchants.create`, NOT `merchants.manage`.
   *
   * REPORTED — "field agent should be the one to activate it."
   *
   * `merchants.manage` is the legacy capability that bundles four things —
   * change plan, extend trial, suspend, mark an invoice paid — and a field
   * agent holds none of them, correctly. But activating is not one of those:
   * it is the last step of opening the account, done by the person standing in
   * the shop that just signed. The seat that may open a merchant may finish
   * opening it, which is the same key the login handover already uses.
   *
   * It is still a permission an operator can take off a seat, so a partner who
   * wants activation held back to an admin can have that.
   */
  const who = await requireWritablePartner("merchants.create");
  if (!who) {
    return { status: "error", message: "Your seat can't activate a pharmacy." };
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
