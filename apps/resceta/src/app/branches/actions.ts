"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/tenancy/current-user";
import { saveBranch } from "@/server/pharmacy/branches";

export type BranchState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

export async function saveBranchAction(
  _prev: BranchState,
  formData: FormData,
): Promise<BranchState> {
  let staff;
  try {
    // Opening a branch is a business decision, not a stock one.
    staff = await requireStaff("manageSettings");
  } catch (e) {
    return {
      status: "error",
      message:
        e instanceof Error && e.message === "FORBIDDEN"
          ? "This account cannot manage branches."
          : "Your session has expired. Sign in again.",
    };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { status: "error", message: "A branch needs a name." };

  const res = await saveBranch({
    pharmacyId: staff.pharmacyId,
    branchId: String(formData.get("branchId") ?? "").trim() || null,
    name,
    address: String(formData.get("address") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    // Absent from the FormData entirely when unticked.
    isActive: formData.get("isActive") !== null,
    actorStaffId: staff.staffId,
  });
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath("/branches");
  revalidatePath("/");
  return { status: "done", message: `${name} saved.` };
}
