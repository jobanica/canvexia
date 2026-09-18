"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/server/tenancy/current-user";
import { completeSale } from "@/server/pharmacy/sale";
import { authoriseSale } from "@/lib/pharmacy/roles";
import { pharmacyDb } from "@/server/tenancy/scoped-db";

/**
 * The counter's one write.
 *
 * The pharmacy is NOT in this form. It comes from `requireStaff()`, which reads
 * the session and the membership rows — so there is no id here for a browser to
 * change, which is the only version of this that is actually safe. Before
 * sign-in existed the slug came off the URL; that was the thing sign-in had to
 * fix, not a detail it happened to touch.
 *
 * Three gates, in order of what they protect:
 *   1. authenticated, and permitted to sell at all
 *   2. permitted to dispense THIS cart — a cashier cannot complete one
 *      containing a prescription-only item (statutory; see roles.ts)
 *   3. a statutory discount needs the beneficiary's ID on the record
 *
 * `completeSale` still runs under pharmacyDb, so even a bug here reaches only
 * this pharmacy's stock. Two layers, deliberately.
 */

const Line = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().int().positive().max(9999),
});

const Sale = z.object({
  lines: z.array(Line).min(1).max(200),
  discountType: z.enum(["none", "manual", "sc", "pwd"]).default("none"),
  beneficiaryIdNo: z.string().trim().max(40).optional(),
  beneficiaryName: z.string().trim().max(120).optional(),
  paymentMethod: z.enum(["cash", "gcash", "card", "maya"]).default("cash"),
  tenderedCentavos: z.coerce.number().int().min(0).optional(),
  prescriptionRef: z.string().trim().max(120).optional(),
  /*
    SPLIT TENDERS. Bounded at eight because a bill settled eight ways is a
    typo, not a customer, and an unbounded array here is an unbounded number of
    inserts inside the sale transaction.
  */
  payments: z
    .array(
      z.object({
        method: z.enum(["cash", "gcash", "card", "maya"]),
        amountCentavos: z.coerce.number().int().positive().max(100_000_000),
      }),
    )
    .max(8)
    .optional(),
  /*
    The loyalty member, and what they want to spend. BOTH ARE CHECKED AGAIN
    SERVER-SIDE: `completeSale` reads the balance and the rate from the
    database and caps the redemption itself, so a browser claiming a customer
    it does not own, or points they have not earned, changes nothing.
  */
  customerId: z.string().uuid().optional(),
  pointsToRedeem: z.coerce.number().int().min(0).max(10_000_000).optional(),
});

export type SaleState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "done";
      saleId: string;
      receiptNumber: string;
      totalCentavos: number;
      changeCentavos: number;
    };

export async function recordSale(
  _prev: SaleState,
  formData: FormData,
): Promise<SaleState> {
  let staff;
  try {
    staff = await requireStaff("sell");
  } catch (e) {
    return {
      status: "error",
      message:
        e instanceof Error && e.message === "FORBIDDEN"
          ? "This account cannot ring up sales."
          : "Your session has expired. Sign in again.",
    };
  }

  if (staff.pharmacyStatus !== "active") {
    return { status: "error", message: "This pharmacy cannot dispense yet." };
  }

  let raw: unknown;
  try {
    raw = {
      lines: JSON.parse(String(formData.get("lines") ?? "[]")),
      discountType: String(formData.get("discountType") ?? "none"),
      beneficiaryIdNo: formData.get("beneficiaryIdNo") || undefined,
      beneficiaryName: formData.get("beneficiaryName") || undefined,
      paymentMethod: String(formData.get("paymentMethod") ?? "cash"),
      tenderedCentavos: formData.get("tenderedCentavos") || undefined,
      prescriptionRef: formData.get("prescriptionRef") || undefined,
      payments: JSON.parse(String(formData.get("payments") ?? "[]")),
      customerId: formData.get("customerId") || undefined,
      pointsToRedeem: formData.get("pointsToRedeem") || undefined,
    };
  } catch {
    return { status: "error", message: "That sale didn't come through — try again." };
  }

  const parsed = Sale.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", message: "That sale doesn't look right — check the cart." };
  }
  const input = parsed.data;

  // Whether the cart needs a pharmacist is decided from the DATABASE, not from
  // anything the form said. A browser that omits the Rx flag must not be able
  // to talk a cashier's till into dispensing an antibiotic.
  const flags = await pharmacyDb(staff.pharmacyId, (tx) =>
    tx.pharmacyProduct.findMany({
      where: { id: { in: input.lines.map((l) => l.productId) } },
      select: { requiresPrescription: true },
    }),
  );
  const authorised = authoriseSale(staff.role, flags);
  if (!authorised.ok) return { status: "error", message: authorised.message };

  if (
    (input.discountType === "sc" || input.discountType === "pwd") &&
    !input.beneficiaryIdNo
  ) {
    return {
      status: "error",
      message:
        "Record the Senior Citizen or PWD ID number — the discount is not valid without it.",
    };
  }

  const outcome = await completeSale({
    pharmacyId: staff.pharmacyId,
    lines: input.lines,
    discountType: input.discountType,
    beneficiaryIdNo: input.beneficiaryIdNo,
    beneficiaryName: input.beneficiaryName,
    paymentMethod: input.paymentMethod,
    tenderedCentavos: input.tenderedCentavos,
    payments: input.payments,
    customerId: input.customerId ?? null,
    pointsToRedeem: input.pointsToRedeem,
    prescriptionRef: input.prescriptionRef,
    soldByStaffId: staff.staffId,
  });

  if (!outcome.ok) return { status: "error", message: outcome.message };

  revalidatePath("/");
  revalidatePath("/pos");
  return {
    status: "done",
    // Carried back so the counter can offer the print. Without it the only way
    // to the receipt just rung up is to go and find it in the list.
    saleId: outcome.saleId,
    receiptNumber: outcome.receiptNumber,
    totalCentavos: outcome.totalCentavos,
    changeCentavos: outcome.changeCentavos,
  };
}
