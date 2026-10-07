import "server-only";
import { staffDb } from "@/server/scoped-db";
import { writeAudit } from "@/server/audit";
import { staffActor, type SignedInStaff } from "@/server/auth";
import { loadSettings } from "@/server/settings";
import { codeRefusal } from "@/server/events/ingest";
import { normalizeReferralCode } from "@/lib/referral-code";
import { pickRule } from "@/lib/rules";

/**
 * Admin moves a customer to another agent. The previous agent keeps every
 * commission already written — it was earned — and the new agent earns from
 * the next confirmed payment.
 */
export async function reassignAgent(staff: SignedInStaff, referralId: string, newAgentId: string) {
  return staffDb("admin", async (tx) => {
    const r = await tx.agentReferral.findUnique({ where: { id: referralId }, select: { agentId: true } });
    if (!r) return { ok: false as const, error: "Customer not found." };
    const agent = await tx.agent.findUnique({ where: { id: newAgentId }, select: { status: true } });
    if (!agent || agent.status !== "active") return { ok: false as const, error: "Choose an active agent." };
    if (r.agentId === newAgentId) return { ok: true as const };
    await tx.agentReferral.update({ where: { id: referralId }, data: { agentId: newAgentId, agentAttachedAt: new Date() } });
    await writeAudit(tx, staffActor(staff), {
      action: "referral.reassign",
      entity: "agent_referral",
      entityId: referralId,
      before: { agentId: r.agentId },
      after: { agentId: newAgentId },
    });
    return { ok: true as const };
  });
}

/**
 * Attach a code the customer forgot to give at signup, inside the
 * late_referral_code_days window, for a customer with no agent. Same checks as
 * at signup: an active agent, and not a self-referral unless allowed.
 */
export async function addLateCode(staff: SignedInStaff, referralId: string, rawCode: string, now = new Date()) {
  const code = normalizeReferralCode(rawCode);
  if (!code) return { ok: false as const, error: "That is not a referral code." };
  return staffDb("admin", async (tx) => {
    const r = await tx.agentReferral.findUnique({ where: { id: referralId } });
    if (!r) return { ok: false as const, error: "Customer not found." };
    if (r.agentId) return { ok: false as const, error: "This customer already has an agent. Use reassign instead." };
    const settings = await loadSettings(tx);
    const deadline = new Date(r.signedUpAt.getTime() + settings.late_referral_code_days * 86_400_000);
    if (now > deadline) {
      return { ok: false as const, error: `Codes can only be added within ${settings.late_referral_code_days} days of signup.` };
    }
    const agent = await tx.agent.findUnique({ where: { referralCode: code }, select: { id: true, status: true, mobile: true } });
    const refusal = codeRefusal(agent, r.ownerPhone, settings);
    if (refusal) return { ok: false as const, error: `That code cannot be attached (${refusal.replace("_", " ")}).` };
    await tx.agentReferral.update({ where: { id: referralId }, data: { agentId: agent!.id, agentAttachedAt: now, reportedAgentCode: code } });
    await writeAudit(tx, staffActor(staff), {
      action: "referral.late_code",
      entity: "agent_referral",
      entityId: referralId,
      before: { agentId: null },
      after: { agentId: agent!.id, code },
    });
    return { ok: true as const };
  });
}

/**
 * Attach the rule that was in force at signup to a customer who signed up
 * before any rule existed, so their payments can be confirmed.
 */
export async function attachRule(staff: SignedInStaff, referralId: string) {
  return staffDb("admin", async (tx) => {
    const r = await tx.agentReferral.findUnique({ where: { id: referralId } });
    if (!r) return { ok: false as const, error: "Customer not found." };
    if (r.commissionRuleId) return { ok: false as const, error: "This customer already has a rule." };
    const rules = await tx.agentCommissionRule.findMany({
      where: { productId: r.productId },
      select: { id: true, plan: true, validFrom: true, validTo: true },
    });
    // At signup if one covered it; otherwise the one in force now.
    const rule = pickRule(rules, r.plan, r.signedUpAt) ?? pickRule(rules, r.plan, new Date());
    if (!rule) return { ok: false as const, error: "This product has no commission rule yet. Add one first." };
    await tx.agentReferral.update({ where: { id: referralId }, data: { commissionRuleId: rule.id } });
    await writeAudit(tx, staffActor(staff), { action: "referral.attach_rule", entity: "agent_referral", entityId: referralId, after: { ruleId: rule.id } });
    return { ok: true as const };
  });
}
