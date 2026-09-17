"use server";

import { revalidatePath } from "next/cache";
import { requireWritablePartner } from "@/server/partners/auth";
import { activatePharmacy } from "@/server/partners/pharmacies";
import {
  createPharmacyOwner,
  resetPharmacyOwnerPassword,
} from "@/server/partners/pharmacy-owner";

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

export type OwnerState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; credentials: { email: string; password: string }; signInUrl: string };

/**
 * WHERE THE OWNER SIGNS IN.
 *
 * Resceta is its own deployment, so the portal cannot build this from its own
 * host. Configurable, with the production address as the default — a partner
 * reading a URL to somebody standing in front of them needs one that works,
 * not a blank.
 */
function rescetaUrl(): string {
  return (process.env.NEXT_PUBLIC_RESCETA_URL || "https://resceta.vercel.app").replace(/\/$/, "");
}

/**
 * Give the pharmacy owner their login.
 *
 * REPORTED — "I activated it, but I cannot see the login details of the
 * account." There were none, and no way to make any: the first account at a
 * pharmacy came from a CLI run by whoever holds the service-role key, so the
 * partner's flow ended one step short of a usable product.
 *
 * `merchants.create` — the same key that opens the account and the same one
 * Servd's login handover uses. The seat that signed the shop is the one
 * standing in it on the day this is needed.
 */
export async function createPharmacyOwnerAction(
  _prev: OwnerState,
  formData: FormData,
): Promise<OwnerState> {
  const who = await requireWritablePartner("merchants.create");
  if (!who) return { status: "error", message: "Your seat can't create a login." };

  const pharmacyId = String(formData.get("pharmacyId") ?? "").trim();
  if (!pharmacyId) return { status: "error", message: "No pharmacy was selected." };

  const res = await createPharmacyOwner({
    partnerId: who.partnerId,
    pharmacyId,
    email: String(formData.get("email") ?? ""),
    name: String(formData.get("name") ?? "") || null,
    actorEmail: who.email,
  });
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath(`/partner/merchants/pharmacy:${pharmacyId}`);
  revalidatePath("/partner");
  return { status: "done", credentials: res.credentials, signInUrl: rescetaUrl() };
}

/** Re-issue it, because the password above is shown once and stored nowhere. */
export async function resetPharmacyOwnerAction(
  _prev: OwnerState,
  formData: FormData,
): Promise<OwnerState> {
  const who = await requireWritablePartner("merchants.create");
  if (!who) return { status: "error", message: "Your seat can't reset that password." };

  const pharmacyId = String(formData.get("pharmacyId") ?? "").trim();
  if (!pharmacyId) return { status: "error", message: "No pharmacy was selected." };

  const res = await resetPharmacyOwnerPassword({
    partnerId: who.partnerId,
    pharmacyId,
    actorEmail: who.email,
  });
  if (!res.ok) return { status: "error", message: res.error };

  return { status: "done", credentials: res.credentials, signInUrl: rescetaUrl() };
}
