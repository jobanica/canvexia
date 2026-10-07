import "server-only";
import { staffDb } from "@/server/scoped-db";
import { validateNewRule, type NewRuleInput } from "@/lib/rules";
import { writeAudit } from "@/server/audit";
import { staffActor, type SignedInStaff } from "@/server/auth";

/**
 * Add a commission rule. Never edits one: the rule open for the same product
 * and plan is closed at the new rule's start, in the same transaction, and
 * customers already pinned to it keep it.
 */
export async function addCommissionRule(
  staff: SignedInStaff,
  productId: string,
  input: NewRuleInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  return staffDb("admin", async (tx) => {
    const existing = await tx.agentCommissionRule.findMany({
      where: { productId, plan: input.plan },
      select: { id: true, plan: true, validFrom: true, validTo: true },
    });
    const check = validateNewRule(input, existing);
    if (!check.ok) return check;

    if (check.closes) {
      await tx.agentCommissionRule.update({
        where: { id: check.closes.id },
        data: { validTo: input.validFrom },
      });
    }
    const rule = await tx.agentCommissionRule.create({
      data: { productId, ...input, createdBy: staff.email },
    });
    await writeAudit(tx, staffActor(staff), {
      action: "commission_rule.create",
      entity: "agent_commission_rule",
      entityId: rule.id,
      before: check.closes ? { closed: check.closes.id, at: input.validFrom } : null,
      after: { productId, ...input },
    });
    return { ok: true, id: rule.id };
  });
}
