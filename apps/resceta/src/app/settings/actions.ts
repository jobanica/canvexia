"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/server/tenancy/current-user";
import { updatePharmacySettings } from "@/server/pharmacy/settings";

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
 */

/** Trim, and treat an empty box as "not set". */
const Optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .default(null);

const Settings = z.object({
  displayName: Optional(120),
  address: Optional(300),
  phone: Optional(40),
  email: Optional(200),
  tin: Optional(40),
  fdaLtoNumber: Optional(60),
  prcLicenseNo: Optional(60),
  // A whole percent, and capped well below anything a tax authority has ever
  // charged — the field exists so a statutory rate change is not a code change,
  // not so a till can be talked into a 900% VAT line.
  vatRatePct: z.coerce.number().int().min(0).max(25),
});

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

  const parsed = Settings.safeParse({
    displayName: formData.get("displayName") ?? "",
    address: formData.get("address") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    tin: formData.get("tin") ?? "",
    fdaLtoNumber: formData.get("fdaLtoNumber") ?? "",
    prcLicenseNo: formData.get("prcLicenseNo") ?? "",
    vatRatePct: formData.get("vatRatePct") ?? 12,
  });
  if (!parsed.success) {
    return { status: "error", message: "Check the details — something didn't look right." };
  }

  const saved = await updatePharmacySettings({
    pharmacyId: staff.pharmacyId,
    actorStaffId: staff.staffId,
    ...parsed.data,
  });
  if (!saved) return { status: "error", message: "That pharmacy no longer exists." };

  // Every receipt renders from these, so the receipt pages have to forget what
  // they knew.
  revalidatePath("/settings");
  revalidatePath("/receipts", "layout");

  return { status: "done", message: "Saved. New receipts carry these details." };
}
