"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/tenancy/current-user";
import { CustomerInput, PointsAdjustment } from "@/lib/pharmacy/customer-input";
import { adjustPoints, createCustomer, updateCustomer } from "@/server/pharmacy/customers";

/**
 * Customer writes.
 *
 * `sell` is the gate, not `manageCatalogue` or `viewReports`. The person who
 * needs to add a customer is the one at the counter with that customer in front
 * of them — a permission only the owner holds means the record never gets
 * created, and the loyalty programme quietly does not exist.
 *
 * Points ADJUSTMENTS are different and need `viewReports`: handing out points
 * is handing out money, and it is not a counter decision.
 */

export type CustomerState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

function denied(e: unknown, what: string): CustomerState {
  return {
    status: "error",
    message:
      e instanceof Error && e.message === "FORBIDDEN"
        ? `This account cannot ${what}.`
        : "Your session has expired. Sign in again.",
  };
}

export async function saveCustomer(
  _prev: CustomerState,
  formData: FormData,
): Promise<CustomerState> {
  let staff;
  try {
    staff = await requireStaff("sell");
  } catch (e) {
    return denied(e, "add customers");
  }

  const parsed = CustomerInput.safeParse({
    name: formData.get("name") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    address: formData.get("address") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the fields." };
  }

  const id = String(formData.get("customerId") ?? "").trim();
  const res = id
    ? await updateCustomer(staff.pharmacyId, id, parsed.data, staff.staffId)
    : await createCustomer(staff.pharmacyId, parsed.data, staff.staffId);
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath("/customers");
  if (id) revalidatePath(`/customers/${id}`);
  return { status: "done", message: id ? "Customer updated." : `${parsed.data.name} added.` };
}

export async function adjustCustomerPoints(
  _prev: CustomerState,
  formData: FormData,
): Promise<CustomerState> {
  let staff;
  try {
    // Handing out points is handing out money.
    staff = await requireStaff("viewReports");
  } catch (e) {
    return denied(e, "adjust points");
  }

  const customerId = String(formData.get("customerId") ?? "").trim();
  if (!customerId) return { status: "error", message: "No customer was selected." };

  const parsed = PointsAdjustment.safeParse({
    points: formData.get("points") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the fields." };
  }

  const res = await adjustPoints({
    pharmacyId: staff.pharmacyId,
    customerId,
    points: parsed.data.points,
    note: parsed.data.note,
    actorStaffId: staff.staffId,
  });
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return { status: "done", message: `Balance is now ${res.balance} points.` };
}
