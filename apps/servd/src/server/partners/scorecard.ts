import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import { buildScorecard, type ScorecardRow, type StaffFacts } from "@/lib/partners/scorecard";

/**
 * The scorecard's reads.
 *
 * FOUR FLAT QUERIES, not one per person. A partner has tens of staff and a loop
 * of queries here is a loop of transactions — the mistake that cost the portal
 * six of its seven seconds. Everything is grouped in memory afterwards.
 */
export async function getScorecard(
  partnerId: string,
  month: string,
  opts: { onlyUserId?: string } = {},
): Promise<ScorecardRow[]> {
  const from = new Date(`${month}-01T00:00:00+08:00`);
  const to = nextMonthStart(month);

  const [seats, events, targets, merchants] = await systemDb(async (tx) => [
    await tx.partnerUser.findMany({
      where: {
        partnerId,
        ...(opts.onlyUserId ? { id: opts.onlyUserId } : {}),
        // Deactivated seats are INCLUDED when a month is asked for explicitly:
        // somebody who left in September still did September's work, and a
        // scorecard that erases them makes the month's totals stop adding up.
      },
      select: { id: true, name: true, email: true, status: true },
    }),
    await tx.staffEvent
      .groupBy({
        by: ["partnerUserId", "kind"],
        where: { partnerId, occurredAt: { gte: from, lt: to } },
        _count: { _all: true },
      })
      .catch(() => [] as { partnerUserId: string; kind: string; _count: { _all: number } }[]),
    await tx.staffTarget
      .findMany({
        where: { partnerId, month },
        select: {
          partnerUserId: true,
          targetMerchants: true,
          targetVisits: true,
          targetDemos: true,
        },
      })
      .catch(() => []),
    await merchantCounts(tx, partnerId),
  ]);

  const eventCount = new Map<string, number>();
  for (const e of events) eventCount.set(`${e.partnerUserId}:${e.kind}`, e._count._all);
  const targetBy = new Map(targets.map((t) => [t.partnerUserId, t]));

  const facts: StaffFacts[] = seats
    .filter((s) => s.status === "active" || hasActivity(s.id, eventCount))
    .map((s) => {
      const t = targetBy.get(s.id);
      const m = merchants.get(s.id) ?? { active: 0, churned: 0 };
      return {
        partnerUserId: s.id,
        name: s.name ?? s.email,
        visits: eventCount.get(`${s.id}:visit.logged`) ?? 0,
        demos: eventCount.get(`${s.id}:demo.built`) ?? 0,
        trials: eventCount.get(`${s.id}:trial.started`) ?? 0,
        conversions: eventCount.get(`${s.id}:merchant.converted`) ?? 0,
        activeMerchants: m.active,
        churnedMerchants: m.churned,
        target: t
          ? { merchants: t.targetMerchants, visits: t.targetVisits, demos: t.targetDemos }
          : null,
      };
    });

  return buildScorecard(facts);
}

function hasActivity(id: string, counts: Map<string, number>): boolean {
  for (const key of counts.keys()) if (key.startsWith(`${id}:`)) return true;
  return false;
}

/**
 * Merchants owned NOW, across both tables, by assigned salesperson.
 *
 * A LIVE COUNT, not a historical one, and the column says so. Reconstructing
 * "how many did they own at the end of September" needs a subscription history
 * this schema does not keep; inventing it from today's rows would put a
 * merchant signed last week into every past month, the same way the growth
 * chart on /partner is labelled a growth curve rather than a revenue history.
 */
async function merchantCounts(
  tx: { restaurant: any; pharmacy: any },
  partnerId: string,
): Promise<Map<string, { active: number; churned: number }>> {
  const out = new Map<string, { active: number; churned: number }>();
  const add = (userId: string | null, churned: boolean) => {
    if (!userId) return;
    const cur = out.get(userId) ?? { active: 0, churned: 0 };
    if (churned) cur.churned += 1;
    else cur.active += 1;
    out.set(userId, cur);
  };

  try {
    const [restaurants, pharmacies] = await Promise.all([
      tx.restaurant.findMany({
        where: { partnerId, assignedSalesUserId: { not: null } },
        select: { assignedSalesUserId: true, subscriptionStatus: true },
      }),
      tx.pharmacy.findMany({
        where: { partnerId, assignedSalesUserId: { not: null } },
        select: { assignedSalesUserId: true },
      }),
    ]);
    for (const r of restaurants as { assignedSalesUserId: string | null; subscriptionStatus: string | null }[]) {
      add(r.assignedSalesUserId, r.subscriptionStatus === "cancelled");
    }
    // Resceta does not bill yet, so a pharmacy cannot be churned. Counting it
    // as active is the truth rather than a placeholder.
    for (const p of pharmacies as { assignedSalesUserId: string | null }[]) {
      add(p.assignedSalesUserId, false);
    }
  } catch {
    /* the assignment columns are not migrated yet */
  }
  return out;
}

function nextMonthStart(month: string): Date {
  const [y, m] = month.split("-").map(Number);
  return m === 12
    ? new Date(`${y + 1}-01-01T00:00:00+08:00`)
    : new Date(`${y}-${String(m + 1).padStart(2, "0")}-01T00:00:00+08:00`);
}
