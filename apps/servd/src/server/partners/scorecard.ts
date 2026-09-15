import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import { buildScorecard, type ScorecardRow, type StaffFacts } from "@/lib/partners/scorecard";
import { activeSeat, managerSeats, queueNotification } from "@/server/partners/notify";

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

/**
 * Tell people mid-month when a target is behind pace.
 *
 * MID-MONTH, once, on the 15th. Not daily: a nudge that arrives every morning
 * from the 2nd is a nudge nobody reads by the 10th, and the point of a warning
 * is that there is still time to act on it. Not at month end either, when there
 * is nothing anybody can do.
 *
 * "BEHIND PACE" IS MEASURED AGAINST THE FRACTION OF THE MONTH GONE, not against
 * the whole target. On the 15th of a 30-day month, half the target is on pace;
 * comparing to the full number would flag everybody, every time, which is the
 * same as flagging nobody.
 *
 * Goes to the person AND their manager, which is the brief's own rule and the
 * right one: a warning only the manager sees is a performance review, and one
 * only the person sees is a secret.
 */
export async function notifyTargetsAtRisk(asOf: Date = new Date()): Promise<number> {
  const day = Number(
    new Date(asOf.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(8, 10),
  );
  if (day !== 15) return 0;

  const month = `${new Date(asOf.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 7)}`;
  const daysInMonth = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5, 7)),
    0,
  ).getDate();
  const elapsed = day / daysInMonth;

  let sent = 0;
  try {
    const partners = await systemDb((tx) =>
      tx.partner.findMany({ where: { status: "approved" }, select: { id: true } }),
    );

    for (const partner of partners) {
      const rows = await getScorecard(partner.id, month);
      const behind = rows.filter(
        (r) =>
          r.progress !== null &&
          (r.progress.visits < elapsed ||
            r.progress.demos < elapsed ||
            r.progress.merchants < elapsed),
      );
      if (behind.length === 0) continue;

      const managers = await managerSeats(partner.id);
      for (const row of behind) {
        const seat = await activeSeat(partner.id, row.partnerUserId);
        const body =
          `Halfway through ${month} and ${row.name} is behind pace:\n` +
          `  - Visits: ${row.visits} of ${row.target!.visits}\n` +
          `  - Demos: ${row.demos} of ${row.target!.demos}\n` +
          `  - New merchants: ${row.conversions} of ${row.target!.merchants}\n\n` +
          `There is still half a month.`;

        sent += await queueNotification({
          partnerId: partner.id,
          event: "target.at_risk",
          // The person first, then anybody managing them who is not the same
          // person — an ops manager with their own target should not get two
          // copies of their own warning.
          to: [...(seat ? [seat] : []), ...managers.filter((m) => m.id !== row.partnerUserId)],
          subject: `${row.name} is behind pace for ${month}`,
          body,
        });
      }
    }
  } catch {
    /* never break the cron over a notice */
  }
  return sent;
}
