"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/auth";
import { publishTemplate } from "@/server/contracts";
import { authFailure, type FormState } from "@/lib/form-state";

export async function publishTemplateAction(_p: FormState, fd: FormData): Promise<FormState> {
  let staff;
  try { staff = await requireStaff("admin"); } catch (e) { return authFailure(e); }
  const productId = String(fd.get("productId") ?? "") || null;
  const r = await publishTemplate(staff, productId, String(fd.get("body") ?? ""));
  if (!r.ok) return { status: "error", message: r.error };
  revalidatePath("/admin/templates");
  return { status: "done", message: `Version ${r.version} published. New signers see this version.` };
}
