"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/server/tenancy/current-user";
import { branchContext } from "@/server/pharmacy/branches";
import { receiveDelivery } from "@/server/pharmacy/receiving";
import { can } from "@/lib/pharmacy/roles";
import type { LineIssue } from "@/lib/pharmacy/receiving";

/**
 * Record a delivery.
 *
 * The pharmacy comes from the session, never the form (D30). `manageStock` is
 * the gate to be here at all; whether the caller may ALSO create a product is
 * passed down rather than decided in the write path, because that is a
 * catalogue question and the write path should not be re-deriving permissions.
 */

const Line = z.object({
  productId: z.string().uuid().nullable(),
  newProductName: z.string().trim().max(200).optional(),
  newProductPriceCentavos: z.coerce.number().int().min(0).optional(),
  lotNumber: z.string().trim().max(80).nullable(),
  expiryDate: z.string().trim().max(10).nullable(),
  quantity: z.coerce.number().int().min(1).max(1_000_000),
  unitCostCentavos: z.coerce.number().int().min(0).max(100_000_000),
});

const Delivery = z.object({
  deliveryRef: z.string().uuid(),
  supplierId: z.string().uuid().nullable().optional(),
  newSupplierName: z.string().trim().max(200).optional(),
  reference: z.string().trim().max(120).optional(),
  lines: z.array(Line).min(1).max(200),
});

export type ReceivingState =
  | { status: "idle" }
  | { status: "error"; message: string; issues?: LineIssue[] }
  | { status: "done"; message: string; issues: LineIssue[] };

export async function receiveAction(
  _prev: ReceivingState,
  formData: FormData,
): Promise<ReceivingState> {
  let staff;
  try {
    staff = await requireStaff("manageStock");
  } catch (e) {
    return {
      status: "error",
      message:
        e instanceof Error && e.message === "FORBIDDEN"
          ? "This account cannot receive stock."
          : "Your session has expired. Sign in again.",
    };
  }

  let raw: unknown;
  try {
    raw = {
      deliveryRef: String(formData.get("deliveryRef") ?? ""),
      supplierId: formData.get("supplierId") || null,
      newSupplierName: formData.get("newSupplierName") || undefined,
      reference: formData.get("reference") || undefined,
      lines: JSON.parse(String(formData.get("lines") ?? "[]")),
    };
  } catch {
    return { status: "error", message: "That delivery didn't come through — try again." };
  }

  const parsed = Delivery.safeParse(raw);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the delivery lines — something is missing or out of range.",
    };
  }

  // The delivery lands on the shelf of the branch the session is looking at.
  // From the server, never the form: a branch id in a request body is one
  // somebody can change, and stock filed at the wrong branch is invisible at
  // the right one.
  const branch = await branchContext(staff.pharmacyId);

  const outcome = await receiveDelivery({
    pharmacyId: staff.pharmacyId,
    actorStaffId: staff.staffId,
    branchId: branch.writeBranchId,
    canCreateProducts: can(staff.role, "manageCatalogue"),
    ...parsed.data,
    supplierId: parsed.data.supplierId ?? null,
  });

  if (!outcome.ok) {
    return { status: "error", message: outcome.message, issues: outcome.issues };
  }

  revalidatePath("/");
  revalidatePath("/pos");
  revalidatePath("/receiving");
  return {
    status: "done",
    message:
      `Received ${outcome.unitsReceived} unit${outcome.unitsReceived === 1 ? "" : "s"} ` +
      `across ${outcome.batchesCreated} batch${outcome.batchesCreated === 1 ? "" : "es"}.`,
    issues: outcome.issues,
  };
}
