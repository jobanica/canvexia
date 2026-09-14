"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/server/tenancy/current-user";
import { addStaff, removeStaff } from "@/server/pharmacy/staff";
import { PHARMACY_ROLES } from "@/lib/pharmacy/roles";

export type StaffState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

const Add = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "At least 8 characters."),
  role: z.enum(PHARMACY_ROLES),
  displayName: z.string().trim().max(120).optional(),
});

/**
 * The pharmacy is the caller's own, from the session — never from the form.
 * Otherwise "add staff" would be a way to add yourself to somebody else's
 * pharmacy, which is the single worst thing this screen could do.
 */
export async function addStaffAction(
  _prev: StaffState,
  formData: FormData,
): Promise<StaffState> {
  let staff;
  try {
    staff = await requireStaff("manageStaff");
  } catch (e) {
    return {
      status: "error",
      message:
        e instanceof Error && e.message === "FORBIDDEN"
          ? "This account cannot manage staff."
          : "Your session has expired. Sign in again.",
    };
  }

  const parsed = Add.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
    displayName: formData.get("displayName") || undefined,
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check the details and try again.",
    };
  }

  const outcome = await addStaff({
    pharmacyId: staff.pharmacyId,
    actorStaffId: staff.staffId,
    ...parsed.data,
  });
  if (!outcome.ok) return { status: "error", message: outcome.message };

  revalidatePath("/staff");
  return { status: "done", message: `${outcome.email} can now sign in.` };
}

export async function removeStaffAction(
  _prev: StaffState,
  formData: FormData,
): Promise<StaffState> {
  let staff;
  try {
    staff = await requireStaff("manageStaff");
  } catch {
    return { status: "error", message: "This account cannot manage staff." };
  }

  const staffId = String(formData.get("staffId") ?? "");
  if (!staffId) return { status: "error", message: "Nothing selected." };

  const result = await removeStaff({
    pharmacyId: staff.pharmacyId,
    staffId,
    actorStaffId: staff.staffId,
  });
  if (!result.ok) return { status: "error", message: result.message ?? "Could not remove." };

  revalidatePath("/staff");
  return { status: "done", message: "Account removed." };
}
