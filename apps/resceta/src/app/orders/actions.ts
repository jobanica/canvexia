"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/tenancy/current-user";
import { advanceOrder } from "@/server/pharmacy/storefront";

export type OrderState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

/**
 * Moving an order along.
 *
 * `sell` is the gate: the person who answers the phone and puts the bag
 * together is at the counter. NOTHING HERE TOUCHES STOCK — completing an order
 * means it was collected and rung up as an ordinary sale, which is the one
 * place stock moves.
 */
export async function setOrderStatus(_prev: OrderState, formData: FormData): Promise<OrderState> {
  let staff;
  try {
    staff = await requireStaff("sell");
  } catch (e) {
    return {
      status: "error",
      message:
        e instanceof Error && e.message === "FORBIDDEN"
          ? "This account cannot handle orders."
          : "Your session has expired. Sign in again.",
    };
  }

  const orderId = String(formData.get("orderId") ?? "").trim();
  const to = String(formData.get("to") ?? "").trim();
  if (!orderId || !to) return { status: "error", message: "No order was selected." };

  const res = await advanceOrder({
    pharmacyId: staff.pharmacyId,
    orderId,
    to,
    actorStaffId: staff.staffId,
  });
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath("/orders");
  return { status: "done", message: `Marked ${res.status}.` };
}
