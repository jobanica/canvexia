"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/auth";
import { approvePayout, generatePayouts, markPayoutPaid } from "@/server/payouts";
import { authFailure, type FormState } from "@/lib/form-state";

export async function generateAction(_p: FormState, fd: FormData): Promise<FormState> {
  let staff;
  try { staff = await requireStaff("admin"); } catch (e) { return authFailure(e); }
  const r = await generatePayouts(staff, String(fd.get("period") ?? ""));
  if (!r.ok) return { status: "error", message: r.error };
  revalidatePath("/admin/payouts");
  return { status: "done", message: `${r.created} payout(s) drafted; ${r.carried} agent(s) below the minimum carried forward.` };
}

export async function approveAction(_p: FormState, fd: FormData): Promise<FormState> {
  let staff;
  try { staff = await requireStaff("admin"); } catch (e) { return authFailure(e); }
  const id = String(fd.get("payoutId"));
  const r = await approvePayout(staff, id);
  if (!r.ok) return { status: "error", message: r.error };
  revalidatePath(`/admin/payouts/${id}`);
  return { status: "done", message: "Approved." };
}

export async function paidAction(_p: FormState, fd: FormData): Promise<FormState> {
  let staff;
  try { staff = await requireStaff("admin"); } catch (e) { return authFailure(e); }
  const id = String(fd.get("payoutId"));
  const r = await markPayoutPaid(staff, id, String(fd.get("referenceNumber") ?? ""));
  if (!r.ok) return { status: "error", message: r.error };
  revalidatePath(`/admin/payouts/${id}`);
  return { status: "done", message: "Marked paid." };
}
