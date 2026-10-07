import "server-only";
import { agentDb, staffDb } from "@/server/scoped-db";
import { loadSettings } from "@/server/settings";
import { nextPayoutDate, periodOf, periodStart } from "@/lib/payouts";

/** The agent's home screen numbers. Everything through agentDb: their rows only. */
export async function agentHomeStats(agentId: string, now = new Date()) {
  return agentDb(agentId, async (tx) => {
    const monthStart = periodStart(periodOf(now));
    const [thisMonth, pending, unpaid, awaiting, settings] = await Promise.all([
      tx.agentCommission.aggregate({ _sum: { amount: true }, where: { createdAt: { gte: monthStart } } }),
      tx.agentCommission.aggregate({ _sum: { amount: true }, where: { status: "pending_release" } }),
      tx.agentCommission.aggregate({ _sum: { amount: true }, where: { status: "approved", payoutId: null } }),
      tx.agentPayment.count({ where: { status: "submitted" } }),
      loadSettings(tx),
    ]);
    return {
      thisMonth: thisMonth._sum.amount ?? 0,
      pendingRelease: pending._sum.amount ?? 0,
      unpaidBalance: unpaid._sum.amount ?? 0,
      awaitingVerification: awaiting,
      nextPayout: nextPayoutDate(settings.payout_day_of_month, now),
      payoutMinimum: settings.payout_minimum_amount,
    };
  });
}

/** Admin's view of one agent's performance. */
export async function agentPerformance(agentId: string) {
  return staffDb("admin", async (tx) => {
    const [activations, byStatus, earned, paid] = await Promise.all([
      tx.agentPayment.count({ where: { type: "activation", status: "confirmed", referral: { agentId } } }),
      tx.agentReferral.groupBy({ by: ["status"], where: { agentId }, _count: { _all: true } }),
      tx.agentCommission.aggregate({ _sum: { amount: true }, where: { agentId } }),
      tx.agentCommission.aggregate({ _sum: { amount: true }, where: { agentId, status: "paid" } }),
    ]);
    const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
    const active = count("active");
    const churned = count("churned");
    return {
      activations,
      leads: count("lead"),
      activeCustomers: active,
      churned,
      churnRate: active + churned === 0 ? null : churned / (active + churned),
      commissionEarned: earned._sum.amount ?? 0,
      commissionPaid: paid._sum.amount ?? 0,
    };
  });
}
