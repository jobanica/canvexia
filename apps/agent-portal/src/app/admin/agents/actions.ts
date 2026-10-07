"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/auth";
import { changeAgentStatus } from "@/server/agents";
import { authFailure, type FormState } from "@/lib/form-state";
import type { AgentAction } from "@/lib/agent-status";

const ACTIONS: AgentAction[] = ["approve", "reject", "suspend", "reinstate", "remove"];

export async function agentStatusAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let staff;
  try {
    staff = await requireStaff("admin");
  } catch (e) {
    return authFailure(e);
  }
  const agentId = String(fd.get("agentId") ?? "");
  const action = String(fd.get("action") ?? "") as AgentAction;
  if (!ACTIONS.includes(action)) return { status: "error", message: "Unknown action." };
  const result = await changeAgentStatus(staff, agentId, action);
  if (!result.ok) return { status: "error", message: result.error };
  revalidatePath("/admin/agents");
  revalidatePath(`/admin/agents/${agentId}`);
  return { status: "done", message: "Done." };
}
