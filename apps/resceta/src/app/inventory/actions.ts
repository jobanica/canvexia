"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/tenancy/current-user";
import { WriteoffInput } from "@/lib/pharmacy/writeoff-input";
import { writeOffStock } from "@/server/pharmacy/writeoffs";
import { peso } from "@/lib/money";

export type WriteoffState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

/**
 * Taking stock off the shelf.
 *
 * `manageStock` — the same permission that receives a delivery, and correctly
 * so: the person who puts the boxes on the shelf is the person who takes the
 * expired ones off it. A cashier cannot.
 */
export async function recordWriteoff(
  _prev: WriteoffState,
  formData: FormData,
): Promise<WriteoffState> {
  let staff;
  try {
    staff = await requireStaff("manageStock");
  } catch (e) {
    return {
      status: "error",
      message:
        e instanceof Error && e.message === "FORBIDDEN"
          ? "This account cannot adjust stock."
          : "Your session has expired. Sign in again.",
    };
  }

  const parsed = WriteoffInput.safeParse({
    batchId: formData.get("batchId") ?? "",
    quantity: formData.get("quantity") ?? "",
    reason: formData.get("reason") ?? "other",
    recipient: formData.get("recipient") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the fields." };
  }

  const res = await writeOffStock({
    pharmacyId: staff.pharmacyId,
    values: parsed.data,
    actorStaffId: staff.staffId,
  });
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath("/inventory");
  revalidatePath("/alerts");
  revalidatePath("/");
  return {
    status: "done",
    message: `${res.quantity} × ${res.productName} off the shelf — ${peso(res.costCentavos)} at cost.`,
  };
}
