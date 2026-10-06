"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/auth";
import { saveSettings } from "@/server/settings";
import { parseSettingsForm } from "@/lib/settings";
import { authFailure, formStrings, type FormState } from "@/lib/form-state";

export async function saveSettingsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let staff;
  try { staff = await requireStaff("admin"); } catch (e) { return authFailure(e); }
  const parsed = parseSettingsForm(formStrings(fd));
  if (!parsed.ok) return { status: "error", message: parsed.error };
  const changed = await saveSettings(staff, parsed.settings);
  revalidatePath("/admin/settings");
  return { status: "done", message: changed.length ? `Saved: ${changed.join(", ")}.` : "Nothing changed." };
}
