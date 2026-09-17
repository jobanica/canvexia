"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/tenancy/current-user";
import { attachPharmacyReceipt, startPharmacyRenewal } from "@/server/pharmacy/billing";

/**
 * Renewing, from the pharmacy's side.
 *
 * The pharmacy comes from the session, never the form. `manageSettings` is the
 * gate — the owner's permission, and the same one that guards the statutory
 * identity on the receipt. Paying the bill is an owner's decision, not a
 * manager's and certainly not a cashier's.
 */

export type BillingState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

function denied(e: unknown): BillingState {
  return {
    status: "error",
    message:
      e instanceof Error && e.message === "FORBIDDEN"
        ? "Only the owner can renew this account."
        : "Your session has expired. Sign in again.",
  };
}

export async function startRenewal(): Promise<BillingState> {
  let staff;
  try {
    staff = await requireStaff("manageSettings");
  } catch (e) {
    return denied(e);
  }

  const res = await startPharmacyRenewal(staff.pharmacyId);
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath("/billing");
  return { status: "done", message: "Pay using the code below, then upload your receipt." };
}

export async function uploadReceipt(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  let staff;
  try {
    staff = await requireStaff("manageSettings");
  } catch (e) {
    return denied(e);
  }

  const file = formData.get("receipt");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Pick a photo or screenshot." };
  }

  const res = await attachPharmacyReceipt(staff.pharmacyId, file);
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath("/billing");
  return {
    status: "done",
    message: "Sent. Your partner will confirm it and your plan will be extended.",
  };
}
