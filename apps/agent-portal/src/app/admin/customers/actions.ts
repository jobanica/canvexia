"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/auth";
import { addLateCode, attachRule, reassignAgent } from "@/server/customers-admin";
import { authFailure, type FormState } from "@/lib/form-state";

function done(id: string, r: { ok: true } | { ok: false; error: string }, message: string): FormState {
  if (!r.ok) return { status: "error", message: r.error };
  revalidatePath(`/admin/customers/${id}`);
  return { status: "done", message };
}

export async function reassignAction(_p: FormState, fd: FormData): Promise<FormState> {
  let staff;
  try { staff = await requireStaff("admin"); } catch (e) { return authFailure(e); }
  const id = String(fd.get("referralId"));
  return done(id, await reassignAgent(staff, id, String(fd.get("agentId"))), "Reassigned. The new agent earns from the next confirmed payment.");
}

export async function lateCodeAction(_p: FormState, fd: FormData): Promise<FormState> {
  let staff;
  try { staff = await requireStaff("admin"); } catch (e) { return authFailure(e); }
  const id = String(fd.get("referralId"));
  return done(id, await addLateCode(staff, id, String(fd.get("code") ?? "")), "Code attached.");
}

export async function attachRuleAction(_p: FormState, fd: FormData): Promise<FormState> {
  let staff;
  try { staff = await requireStaff("admin"); } catch (e) { return authFailure(e); }
  const id = String(fd.get("referralId"));
  return done(id, await attachRule(staff, id), "Rule attached.");
}
