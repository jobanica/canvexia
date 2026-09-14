"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { resolveSlug } from "@/server/pharmacy/queries";
import { completeSale } from "@/server/pharmacy/sale";

/**
 * The counter's one write.
 *
 * The slug is resolved here rather than trusted from the form: the form is
 * whatever the browser posted, and a pharmacy id taken straight from it would
 * be the one place the whole tenancy argument could be walked around. Resolving
 * it server-side means the id handed to completeSale came from the route.
 *
 * Even so, completeSale runs under pharmacyDb, so a wrong id would return
 * nothing rather than another pharmacy's stock. Two layers, deliberately —
 * exactly the reasoning behind the RLS policies themselves.
 */

const Line = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().int().positive(),
});

const Sale = z.object({
  slug: z.string().min(1),
  lines: z.array(Line).min(1),
  discountType: z.enum(["none", "manual", "sc", "pwd"]).default("none"),
  manualDiscountCentavos: z.coerce.number().int().min(0).optional(),
  beneficiaryIdNo: z.string().trim().max(40).optional(),
  beneficiaryName: z.string().trim().max(120).optional(),
  paymentMethod: z.enum(["cash", "gcash", "card", "maya"]).default("cash"),
  tenderedCentavos: z.coerce.number().int().min(0).optional(),
  prescriptionRef: z.string().trim().max(120).optional(),
});

export type SaleState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; receiptNumber: string; totalCentavos: number; changeCentavos: number };

export async function recordSale(
  _prev: SaleState,
  formData: FormData,
): Promise<SaleState> {
  const raw = {
    slug: String(formData.get("slug") ?? ""),
    lines: JSON.parse(String(formData.get("lines") ?? "[]")),
    discountType: String(formData.get("discountType") ?? "none"),
    manualDiscountCentavos: formData.get("manualDiscountCentavos") || undefined,
    beneficiaryIdNo: formData.get("beneficiaryIdNo") || undefined,
    beneficiaryName: formData.get("beneficiaryName") || undefined,
    paymentMethod: String(formData.get("paymentMethod") ?? "cash"),
    tenderedCentavos: formData.get("tenderedCentavos") || undefined,
    prescriptionRef: formData.get("prescriptionRef") || undefined,
  };

  const parsed = Sale.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", message: "That sale doesn't look right — check the cart." };
  }
  const input = parsed.data;

  // A statutory discount without the ID number on the record is not a valid
  // SC/PWD sale: the ID is what the pharmacy has to be able to show.
  if (
    (input.discountType === "sc" || input.discountType === "pwd") &&
    !input.beneficiaryIdNo
  ) {
    return {
      status: "error",
      message: "Record the Senior Citizen or PWD ID number — the discount is not valid without it.",
    };
  }

  const pharmacy = await resolveSlug(input.slug);
  if (!pharmacy) return { status: "error", message: "Pharmacy not found." };
  if (pharmacy.status !== "active") {
    return {
      status: "error",
      message: `This pharmacy is ${pharmacy.status} and cannot dispense.`,
    };
  }

  const outcome = await completeSale({
    pharmacyId: pharmacy.id,
    lines: input.lines,
    discountType: input.discountType,
    manualDiscountCentavos: input.manualDiscountCentavos,
    beneficiaryIdNo: input.beneficiaryIdNo,
    beneficiaryName: input.beneficiaryName,
    paymentMethod: input.paymentMethod,
    tenderedCentavos: input.tenderedCentavos,
    prescriptionRef: input.prescriptionRef,
  });

  if (!outcome.ok) return { status: "error", message: outcome.message };

  revalidatePath(`/${input.slug}`);
  revalidatePath(`/${input.slug}/pos`);
  return {
    status: "done",
    receiptNumber: outcome.receiptNumber,
    totalCentavos: outcome.totalCentavos,
    changeCentavos: outcome.changeCentavos,
  };
}
