"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/auth";
import { retryEvent } from "@/server/events/ingest";
import { authFailure, type FormState } from "@/lib/form-state";

export async function retryEventAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try { await requireStaff("admin"); } catch (e) { return authFailure(e); }
  const result = await retryEvent(String(fd.get("eventRowId") ?? ""));
  revalidatePath("/admin/events");
  return {
    status: "done",
    message:
      result === "processed" ? "Processed."
      : result === "pending" ? "Still waiting for its customer."
      : result === "refused" ? "Refused — see the error."
      : "Already processed.",
  };
}
