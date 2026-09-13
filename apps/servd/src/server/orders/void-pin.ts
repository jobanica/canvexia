"use server";

import { revalidatePath } from "next/cache";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireStaff } from "@/server/tenancy/current-user";

export type VoidPinState = { ok?: boolean; message?: string; error?: string } | null;

/** Whether a cashier void PIN is currently configured (never returns the PIN). */
export async function getVoidPinStatus(restaurantId: string): Promise<boolean> {
  try {
    const r = await tenantDb(restaurantId, (tx) =>
      tx.restaurant.findFirst({ select: { cashierVoidPin: true } }),
    );
    return !!r?.cashierVoidPin;
  } catch {
    return false;
  }
}

/** Admin: set or clear the cashier void PIN (4–8 digits; blank clears it). */
export async function setCashierVoidPin(_prev: VoidPinState, formData: FormData): Promise<VoidPinState> {
  let staff;
  try {
    staff = await requireStaff(["admin"]);
  } catch {
    return { error: "Only an admin can change the void PIN." };
  }
  const pin = String(formData.get("pin") ?? "").trim();
  if (pin && !/^\d{4,8}$/.test(pin)) return { error: "PIN must be 4–8 digits." };
  try {
    await tenantDb(staff.restaurantId, (tx) =>
      tx.restaurant.updateMany({ where: { id: staff.restaurantId }, data: { cashierVoidPin: pin || null } }),
    );
  } catch {
    return { error: "Couldn't save the PIN. Run the migration if you haven't yet." };
  }
  revalidatePath("/admin/cashier");
  return { ok: true, message: pin ? "Void PIN saved." : "Void PIN cleared." };
}
