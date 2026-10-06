"use server";

import { revalidatePath } from "next/cache";
import { requireStaff, staffActor } from "@/server/auth";
import { staffDb } from "@/server/scoped-db";
import { writeAudit } from "@/server/audit";
import { authFailure, type FormState } from "@/lib/form-state";

/**
 * Publish a new agent agreement. Versions are never edited: what an agent
 * accepted stays exactly what they read, and agents.agreementVersion points at
 * it. Publishing deactivates the previous version in the same transaction.
 */
export async function publishAgreementAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let staff;
  try { staff = await requireStaff("admin"); } catch (e) { return authFailure(e); }
  const body = String(fd.get("body") ?? "").trim();
  if (body.length < 50) return { status: "error", message: "The agreement text is too short." };

  const version = await staffDb("admin", async (tx) => {
    const latest = await tx.agentContractTemplate.findFirst({
      where: { kind: "agent", productId: null },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const next = (latest?.version ?? 0) + 1;
    await tx.agentContractTemplate.updateMany({
      where: { kind: "agent", productId: null, active: true },
      data: { active: false },
    });
    const t = await tx.agentContractTemplate.create({
      data: { kind: "agent", productId: null, version: next, body, active: true },
    });
    await writeAudit(tx, staffActor(staff), {
      action: "agent_agreement.publish",
      entity: "agent_contract_template",
      entityId: t.id,
      after: { version: next },
    });
    return next;
  });
  revalidatePath("/admin/agreement");
  return { status: "done", message: `Version ${version} published. New applicants accept this version.` };
}
