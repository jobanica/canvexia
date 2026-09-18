"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/tenancy/current-user";
import { updatePharmacySettings } from "@/server/pharmacy/settings";
import {
  SettingsInput,
  parseReceiptFlags,
  parseStorefrontFlags,
} from "@/lib/pharmacy/settings-input";

/**
 * Save the pharmacy's statutory identity.
 *
 * The pharmacy is not in this form — it comes from the session, same as every
 * other write in this app. What IS in the form is a set of numbers that appear
 * on a legal document, so each one is length-bounded and trimmed, and an empty
 * box clears the field rather than storing "".
 *
 * A blank is meaningfully different from a space: `receiptGaps` treats
 * whitespace as missing and marks the receipt unofficial, which is the right
 * answer and is only reachable if "" never reaches the column.
 *
 * The shape itself is in `lib/pharmacy/settings-input.ts`, where it can be
 * tested — a `"use server"` file may only export async functions.
 */

export type SettingsState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

export async function saveSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  let staff;
  try {
    staff = await requireStaff("manageSettings");
  } catch (e) {
    return {
      status: "error",
      message:
        e instanceof Error && e.message === "FORBIDDEN"
          ? "This account cannot change the pharmacy's details."
          : "Your session has expired. Sign in again.",
    };
  }

  const parsed = SettingsInput.safeParse({
    displayName: formData.get("displayName") ?? "",
    address: formData.get("address") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    tin: formData.get("tin") ?? "",
    fdaLtoNumber: formData.get("fdaLtoNumber") ?? "",
    prcLicenseNo: formData.get("prcLicenseNo") ?? "",
    vatRatePct: formData.get("vatRatePct") ?? "",

    receiptPaperMm: formData.get("receiptPaperMm") ?? "58",
    receiptHeader: formData.get("receiptHeader") ?? "",
    receiptFooter: formData.get("receiptFooter") ?? "",
    birPermitNo: formData.get("birPermitNo") ?? "",
    posSerialNo: formData.get("posSerialNo") ?? "",

    loyaltyPointsPerPeso: formData.get("loyaltyPointsPerPeso") ?? "",
    loyaltyCentavosPerPoint: formData.get("loyaltyCentavosPerPoint") ?? "",

    storefrontBlurb: formData.get("storefrontBlurb") ?? "",
  });
  if (!parsed.success) {
    // Surface the schema's own message where it has one — "enter the VAT rate"
    // is actionable; "something didn't look right" is not.
    const first = parsed.error.issues[0]?.message;
    return {
      status: "error",
      message: first && !first.startsWith("Invalid")
        ? first
        : "Check the details — something didn't look right.",
    };
  }

  // The checkboxes are read against the marker the section carries: an
  // unticked box is absent from the FormData, so without it "not sent" and
  // "turned off" are indistinguishable and a partial save would close the shop.
  const flags = parseStorefrontFlags({
    sectionPresent: formData.get("storefrontSection"),
    storefrontOn: formData.get("storefrontOn"),
    storefrontAcceptsDelivery: formData.get("storefrontAcceptsDelivery"),
  });

  const receiptFlags = parseReceiptFlags({
    sectionPresent: formData.get("receiptSection"),
    autoPrintReceipt: formData.get("autoPrintReceipt"),
  });

  const saved = await updatePharmacySettings({
    pharmacyId: staff.pharmacyId,
    actorStaffId: staff.staffId,
    ...parsed.data,
    ...flags,
    ...receiptFlags,
  });
  if (!saved) return { status: "error", message: "That pharmacy no longer exists." };

  // Every receipt renders from these, so the receipt pages have to forget what
  // they knew.
  revalidatePath("/settings");
  revalidatePath("/receipts", "layout");
  // The storefront renders from these too, and it is the page a customer sees.
  revalidatePath("/shop", "layout");

  return { status: "done", message: "Saved. New receipts carry these details." };
}
