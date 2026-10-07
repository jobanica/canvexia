import "server-only";
import { Prisma } from "@prisma/client";
import type { CodeLookupResponse } from "@servd/core/agent-kit";
import { staffDb, systemDb } from "@/server/scoped-db";
import { writeAudit } from "@/server/audit";
import { staffActor, type SignedInStaff } from "@/server/auth";
import { generateReferralCode, normalizeReferralCode } from "@/lib/referral-code";
import { agentTransition, codeAttaches, type AgentAction } from "@/lib/agent-status";

export interface ApplicationInput {
  name: string;
  mobile: string;
  payoutMethod: string;
  payoutAccountName: string;
  payoutAccountNumber: string;
}

/** The active agent agreement, which an applicant must accept. */
export async function activeAgentAgreement() {
  return systemDb((tx) =>
    tx.agentContractTemplate.findFirst({
      where: { kind: "agent", productId: null, active: true },
      select: { id: true, version: true, body: true },
    }),
  );
}

/**
 * Turn a signed-in Supabase user into a pending agent.
 *
 * systemDb because the applicant is not an agent yet — there is no agent id to
 * scope by. What makes that safe is that the only identity used is the one
 * from the session, passed in by the caller, and the row is created `pending`:
 * nothing it can do until an admin approves it.
 */
export async function createApplication(
  user: { id: string; email: string },
  input: ApplicationInput,
  agreementVersion: number,
): Promise<{ ok: true; agentId: string } | { ok: false; error: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const agent = await systemDb(async (tx) => {
        const existing = await tx.agent.findUnique({ where: { authUserId: user.id } });
        if (existing) return null;
        const a = await tx.agent.create({
          data: {
            authUserId: user.id,
            email: user.email,
            ...input,
            referralCode: generateReferralCode(),
            status: "pending",
            agreementAcceptedAt: new Date(),
            agreementVersion,
          },
        });
        await writeAudit(tx, { type: "agent", id: a.id, email: user.email }, {
          action: "agent.apply",
          entity: "agent",
          entityId: a.id,
          after: { name: a.name, mobile: a.mobile, agreementVersion },
        });
        return a;
      });
      if (!agent) return { ok: false, error: "You have already applied with this account." };
      return { ok: true, agentId: agent.id };
    } catch (e) {
      // A referral-code collision: try another code. Anything else is real.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002" &&
        String(e.meta?.target ?? "").includes("referralCode")
      ) {
        continue;
      }
      throw e;
    }
  }
  return { ok: false, error: "Could not allocate a referral code. Please try again." };
}

export async function changeAgentStatus(
  staff: SignedInStaff,
  agentId: string,
  action: AgentAction,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return staffDb("admin", async (tx) => {
    const agent = await tx.agent.findUnique({ where: { id: agentId }, select: { status: true } });
    if (!agent) return { ok: false, error: "Agent not found." };
    const t = agentTransition(agent.status, action);
    if (!t.ok) return t;
    await tx.agent.update({
      where: { id: agentId },
      data: {
        status: t.to,
        ...(action === "approve" ? { approvedAt: new Date(), approvedBy: staff.email } : {}),
      },
    });
    await writeAudit(tx, staffActor(staff), {
      action: `agent.${action}`,
      entity: "agent",
      entityId: agentId,
      before: { status: agent.status },
      after: { status: t.to },
    });
    return { ok: true };
  });
}

/** GET /api/v1/codes/{code} */
export async function lookupCode(raw: string): Promise<CodeLookupResponse> {
  const code = normalizeReferralCode(raw);
  if (!code) return { code: raw, valid: false, active: false, agent_name: null };
  const agent = await systemDb((tx) =>
    tx.agent.findUnique({ where: { referralCode: code }, select: { name: true, status: true } }),
  );
  if (!agent) return { code, valid: false, active: false, agent_name: null };
  const active = codeAttaches(agent.status);
  // The name only for an active agent: a code from a removed agent should not
  // keep advertising who they were.
  return { code, valid: true, active, agent_name: active ? agent.name : null };
}
