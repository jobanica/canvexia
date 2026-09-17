"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/tenancy/current-user";
import { SupplierInput } from "@/lib/pharmacy/supplier-input";
import { createSupplier, deleteSupplier, updateSupplier } from "@/server/pharmacy/suppliers";

/**
 * Supplier writes.
 *
 * `manageStock` is the gate, not `manageCatalogue`: who you buy from is a stock
 * question, and the pharmacist who receives the deliveries is the one who knows
 * the rep's mobile number. Owner and manager hold it too.
 */

export type SupplierState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

function denied(e: unknown): SupplierState {
  return {
    status: "error",
    message:
      e instanceof Error && e.message === "FORBIDDEN"
        ? "This account cannot change suppliers."
        : "Your session has expired. Sign in again.",
  };
}

function read(formData: FormData) {
  return SupplierInput.safeParse({
    name: formData.get("name") ?? "",
    contactPerson: formData.get("contactPerson") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    address: formData.get("address") ?? "",
    notes: formData.get("notes") ?? "",
  });
}

export async function saveSupplier(
  _prev: SupplierState,
  formData: FormData,
): Promise<SupplierState> {
  let staff;
  try {
    staff = await requireStaff("manageStock");
  } catch (e) {
    return denied(e);
  }

  const parsed = read(formData);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the fields." };
  }

  // The id comes from the form; the pharmacy never does. Both writes put the
  // session's pharmacy in the WHERE clause, so a forged id touches no rows.
  const id = String(formData.get("supplierId") ?? "").trim();
  const res = id
    ? await updateSupplier(staff.pharmacyId, id, parsed.data, staff.staffId)
    : await createSupplier(staff.pharmacyId, parsed.data, staff.staffId);

  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath("/suppliers");
  revalidatePath("/receiving");
  return { status: "done", message: id ? "Supplier updated." : `${parsed.data.name} added.` };
}

export async function removeSupplier(
  _prev: SupplierState,
  formData: FormData,
): Promise<SupplierState> {
  let staff;
  try {
    staff = await requireStaff("manageStock");
  } catch (e) {
    return denied(e);
  }

  const id = String(formData.get("supplierId") ?? "").trim();
  if (!id) return { status: "error", message: "No supplier was selected." };

  const res = await deleteSupplier(staff.pharmacyId, id, staff.staffId);
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath("/suppliers");
  revalidatePath("/receiving");
  return { status: "done", message: "Supplier removed." };
}
