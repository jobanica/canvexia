"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/auth";
import { confirmPayment, rejectPayment, reversePayment } from "@/server/verification";
import { authFailure, type FormState } from "@/lib/form-state";

async function decide(fd: FormData, run: (id: string, reason: string) => Promise<{ ok: true } | { ok: false; error: string }>, done: string): Promise<FormState> {
  const id = String(fd.get("paymentId") ?? "");
  const result = await run(id, String(fd.get("reason") ?? ""));
  if (!result.ok) return { status: "error", message: result.error };
  revalidatePath("/admin/queue");
  revalidatePath(`/admin/queue/${id}`);
  return { status: "done", message: done };
}

export async function confirmAction(_p: FormState, fd: FormData): Promise<FormState> {
  let staff;
  try { staff = await requireStaff(); } catch (e) { return authFailure(e); }
  return decide(fd, (id) => confirmPayment(staff, id), "Confirmed. Commission written and the product notified.");
}

export async function rejectAction(_p: FormState, fd: FormData): Promise<FormState> {
  let staff;
  try { staff = await requireStaff(); } catch (e) { return authFailure(e); }
  return decide(fd, (id, reason) => rejectPayment(staff, id, reason), "Rejected. The customer will see the reason.");
}

export async function reverseAction(_p: FormState, fd: FormData): Promise<FormState> {
  let staff;
  try { staff = await requireStaff("admin"); } catch (e) { return authFailure(e); }
  return decide(fd, (id, reason) => reversePayment(staff, id, reason), "Reversed. Commissions offset and the product notified.");
}
