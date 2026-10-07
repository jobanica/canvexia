import "server-only";
import type { Prisma } from "@prisma/client";
import { agentDb, staffDb } from "@/server/scoped-db";
import { writeAudit } from "@/server/audit";
import { agentActor, staffActor, type SignedInAgent, type SignedInStaff } from "@/server/auth";

export interface PayoutDetails {
  payoutMethod: string;
  payoutAccountName: string;
  payoutAccountNumber: string;
}

/**
 * An agent asks to be paid somewhere else. Nothing changes until an admin
 * approves it: a hijacked agent login redirecting payouts is exactly the
 * fraud this step exists to stop. One open request at a time.
 */
export async function requestPayoutChange(agent: SignedInAgent, next: PayoutDetails) {
  return agentDb(agent.agentId, async (tx) => {
    const open = await tx.agentPayoutDetailChange.count({ where: { agentId: agent.agentId, status: "pending" } });
    if (open > 0) return { ok: false as const, error: "You already have a change waiting for approval." };
    const me = await tx.agent.findUniqueOrThrow({
      where: { id: agent.agentId },
      select: { payoutMethod: true, payoutAccountName: true, payoutAccountNumber: true },
    });
    await tx.agentPayoutDetailChange.create({
      data: {
        agentId: agent.agentId,
        oldValues: me as unknown as Prisma.InputJsonValue,
        newValues: next as unknown as Prisma.InputJsonValue,
      },
    });
    await writeAudit(tx, agentActor(agent), {
      action: "payout_details.request",
      entity: "agent",
      entityId: agent.agentId,
      before: me,
      after: next,
    });
    return { ok: true as const };
  });
}

export async function decidePayoutChange(staff: SignedInStaff, changeId: string, approve: boolean) {
  return staffDb("admin", async (tx) => {
    const c = await tx.agentPayoutDetailChange.findUnique({ where: { id: changeId } });
    if (!c) return { ok: false as const, error: "Request not found." };
    if (c.status !== "pending") return { ok: false as const, error: `Already ${c.status}.` };
    const now = new Date();
    await tx.agentPayoutDetailChange.update({
      where: { id: changeId },
      data: { status: approve ? "approved" : "rejected", approvedBy: staff.email, decidedAt: now },
    });
    if (approve) {
      const next = c.newValues as unknown as PayoutDetails;
      await tx.agent.update({
        where: { id: c.agentId },
        data: {
          payoutMethod: next.payoutMethod,
          payoutAccountName: next.payoutAccountName,
          payoutAccountNumber: next.payoutAccountNumber,
        },
      });
    }
    await writeAudit(tx, staffActor(staff), {
      action: approve ? "payout_details.approve" : "payout_details.reject",
      entity: "agent",
      entityId: c.agentId,
      before: c.oldValues,
      after: approve ? c.newValues : null,
    });
    return { ok: true as const };
  });
}
