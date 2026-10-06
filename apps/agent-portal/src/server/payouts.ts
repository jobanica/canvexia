import "server-only";
import { staffDb } from "@/server/scoped-db";
import { writeAudit } from "@/server/audit";
import { staffActor, type SignedInStaff } from "@/server/auth";
import { loadSettings } from "@/server/settings";
import { periodStart, planPayouts } from "@/lib/payouts";

/**
 * Monthly payouts, admin only.
 *
 * Generate: every approved commission not yet in a payout and payable before
 * the period began, netted per agent. Agents at or above the minimum get a
 * draft payout and their rows are attached to it; everyone else carries
 * forward untouched. Approve, then mark paid with the transfer reference —
 * which is what marks the rows `paid`.
 */
export async function generatePayouts(staff: SignedInStaff, period: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return { ok: false as const, error: "Choose a month." };
  return staffDb("admin", async (tx) => {
    const settings = await loadSettings(tx);
    const periodDate = new Date(`${period}-01T00:00:00Z`);
    const already = await tx.agentPayout.findMany({ where: { period: periodDate }, select: { agentId: true } });
    const skip = new Set(already.map((p) => p.agentId));

    const rows = await tx.agentCommission.findMany({
      where: { status: "approved", payoutId: null, payableFrom: { lte: periodStart(period) } },
      select: { id: true, agentId: true, amount: true },
    });
    const plan = planPayouts(rows.filter((r) => !skip.has(r.agentId)), settings.payout_minimum_amount);
    const agents = await tx.agent.findMany({
      where: { id: { in: plan.payouts.map((p) => p.agentId) } },
      select: { id: true, payoutMethod: true, payoutAccountName: true, payoutAccountNumber: true },
    });

    for (const p of plan.payouts) {
      const a = agents.find((x) => x.id === p.agentId)!;
      const payout = await tx.agentPayout.create({
        data: {
          agentId: p.agentId,
          period: periodDate,
          total: p.total,
          // A snapshot: where the money was sent, as it was when it was sent.
          method: `${a.payoutMethod} · ${a.payoutAccountName} · ${a.payoutAccountNumber}`,
          status: "draft",
        },
      });
      await tx.agentCommission.updateMany({ where: { id: { in: p.commissionIds } }, data: { payoutId: payout.id } });
    }
    await writeAudit(tx, staffActor(staff), {
      action: "payout.generate",
      entity: "agent_payout",
      entityId: period,
      after: { payouts: plan.payouts.map((p) => ({ agentId: p.agentId, total: p.total })), carried: plan.carried },
    });
    return { ok: true as const, created: plan.payouts.length, carried: plan.carried.length };
  });
}

export async function approvePayout(staff: SignedInStaff, payoutId: string) {
  return staffDb("admin", async (tx) => {
    const p = await tx.agentPayout.findUnique({ where: { id: payoutId } });
    if (!p) return { ok: false as const, error: "Payout not found." };
    if (p.status !== "draft") return { ok: false as const, error: `This payout is already ${p.status}.` };
    await tx.agentPayout.update({ where: { id: payoutId }, data: { status: "approved", approvedBy: staff.email, approvedAt: new Date() } });
    await writeAudit(tx, staffActor(staff), { action: "payout.approve", entity: "agent_payout", entityId: payoutId, before: { status: "draft" }, after: { status: "approved" } });
    return { ok: true as const };
  });
}

export async function markPayoutPaid(staff: SignedInStaff, payoutId: string, referenceNumber: string) {
  const ref = referenceNumber.trim();
  if (ref.length < 3) return { ok: false as const, error: "Enter the transfer reference number." };
  return staffDb("admin", async (tx) => {
    const p = await tx.agentPayout.findUnique({ where: { id: payoutId } });
    if (!p) return { ok: false as const, error: "Payout not found." };
    if (p.status !== "approved") return { ok: false as const, error: "Approve the payout before marking it paid." };
    const now = new Date();
    await tx.agentPayout.update({ where: { id: payoutId }, data: { status: "paid", referenceNumber: ref, paidAt: now, paidBy: staff.email } });
    await tx.agentCommission.updateMany({ where: { payoutId }, data: { status: "paid" } });
    await writeAudit(tx, staffActor(staff), { action: "payout.paid", entity: "agent_payout", entityId: payoutId, before: { status: "approved" }, after: { status: "paid", referenceNumber: ref, total: p.total } });
    return { ok: true as const };
  });
}
