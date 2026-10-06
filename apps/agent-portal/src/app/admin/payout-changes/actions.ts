"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/auth";
import { decidePayoutChange } from "@/server/payout-changes";
import { authFailure, type FormState } from "@/lib/form-state";

export async function decideChangeAction(_p: FormState, fd: FormData): Promise<FormState> {
  let staff;
  try { staff = await requireStaff("admin"); } catch (e) { return authFailure(e); }
  const approve = fd.get("decision") === "approve";
  const r = await decidePayoutChange(staff, String(fd.get("changeId")), approve);
  if (!r.ok) return { status: "error", message: r.error };
  revalidatePath("/admin/payout-changes");
  return { status: "done", message: approve ? "Approved — payouts now go to the new account." : "Rejected." };
}
