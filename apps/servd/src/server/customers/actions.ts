"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/tenancy/current-user";
import { enrollAccount } from "@/server/loyalty/loyalty";

export type AddCustomerState = { ok?: boolean; message?: string; error?: string } | null;

/**
 * Add a customer by hand — for cashier walk-ins or the admin book. We enroll
 * them by phone (+ optional name) into the same loyalty account store that
 * powers the customer list, so the record shows up everywhere immediately.
 */
export async function addCustomer(
  _prev: AddCustomerState,
  formData: FormData,
): Promise<AddCustomerState> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin", "manager"]);
  } catch {
    return { error: "Not allowed." };
  }
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const res = await enrollAccount(staff.restaurantId, phone, name || null);
  if (!res.ok) return { error: res.error ?? "Couldn't add the customer." };
  revalidatePath("/admin/customers");
  return { ok: true, message: name ? `${name} added.` : "Customer added." };
}
