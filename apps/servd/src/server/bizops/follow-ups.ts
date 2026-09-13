import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { dueFollowUps, type DueFollowUp, type FollowUpCandidate } from "@/lib/bizops/follow-up";
import { SEQUENCE } from "@/lib/crm/sequence";

/**
 * The chase list, from both intake tracks at once.
 *
 * The manual track already had a follow-up sequence — that is what the CRM
 * board runs on. The DIY track had none: a shop could build its whole ordering
 * page, get to the payment screen, walk away, and nothing anywhere would ever
 * chase it. Those are the warmest leads the business has, and they were only
 * visible as a count on a funnel report.
 *
 * Both are read best-effort and independently. If the CRM columns lag, the DIY
 * half of the list still renders, and the other way round — a half list is
 * workable, an error page is not.
 */

export interface FollowUpRow extends DueFollowUp {
  /** Where to open the customer profile. */
  restaurantId: string | null;
  contact: string | null;
  /** DIY only: how far they got, so a VA can see it's worth a message. */
  itemCount: number | null;
}

export async function listDueFollowUps(now = new Date()): Promise<FollowUpRow[]> {
  const [outreach, diy] = await Promise.all([outreachCandidates(), diyCandidates()]);
  const extras = new Map([...outreach.extras, ...diy.extras]);
  return dueFollowUps([...outreach.rows, ...diy.rows], now).map((r) => ({
    ...r,
    ...(extras.get(r.id) ?? { restaurantId: null, contact: null, itemCount: null }),
  }));
}

type Extra = { restaurantId: string | null; contact: string | null; itemCount: number | null };

/** CRM prospects with a chase due. */
async function outreachCandidates(): Promise<{
  rows: FollowUpCandidate[];
  extras: Map<string, Extra>;
}> {
  const extras = new Map<string, Extra>();
  try {
    const rows = await systemDb((tx) =>
      tx.crmClient.findMany({
        where: { stage: { notIn: ["won", "lost"] } },
        orderBy: { nextDueAt: "asc" },
        take: 200,
        select: {
          id: true,
          name: true,
          stage: true,
          step: true,
          lastTouchAt: true,
          nextDueAt: true,
          phone: true,
          email: true,
          facebookUrl: true,
          restaurantId: true,
          previewSentAt: true,
          paidAt: true,
          activatedAt: true,
          createdAt: true,
        },
      }),
    );
    const out: FollowUpCandidate[] = rows.map((r) => {
      extras.set(r.id, {
        restaurantId: r.restaurantId ?? null,
        contact: r.phone || r.email || r.facebookUrl || null,
        itemCount: null,
      });
      return {
        id: r.id,
        name: r.name,
        track: "outreach",
        since: (r.previewSentAt ?? r.lastTouchAt ?? r.createdAt).toISOString(),
        dueAt: r.nextDueAt?.toISOString() ?? null,
        step: r.step,
        paidAt: r.paidAt?.toISOString() ?? null,
        activatedAt: r.activatedAt?.toISOString() ?? null,
        stage: r.stage,
      };
    });
    return { rows: out, extras };
  } catch {
    // The business-ops columns haven't been migrated. Fall back to what the CRM
    // board itself reads, so the outreach half of the list still works.
    try {
      const rows = await systemDb((tx) =>
        tx.crmClient.findMany({
          where: { stage: { notIn: ["won", "lost"] } },
          orderBy: { nextDueAt: "asc" },
          take: 200,
          select: {
            id: true,
            name: true,
            stage: true,
            step: true,
            lastTouchAt: true,
            nextDueAt: true,
            phone: true,
            email: true,
            facebookUrl: true,
            createdAt: true,
          },
        }),
      );
      const out: FollowUpCandidate[] = rows.map((r) => {
        extras.set(r.id, {
          restaurantId: null,
          contact: r.phone || r.email || r.facebookUrl || null,
          itemCount: null,
        });
        return {
          id: r.id,
          name: r.name,
          track: "outreach",
          since: (r.lastTouchAt ?? r.createdAt).toISOString(),
          dueAt: r.nextDueAt?.toISOString() ?? null,
          step: r.step,
          paidAt: null,
          activatedAt: null,
          stage: r.stage,
        };
      });
      return { rows: out, extras };
    } catch {
      return { rows: [], extras };
    }
  }
}

/**
 * DIY previews that were built and never paid for.
 *
 * `status: "preview"` IS the unpaid state — a preview becomes `active` on
 * activation — so the suppression rule is satisfied by the query itself rather
 * than by a flag somebody has to remember to set.
 */
async function diyCandidates(): Promise<{ rows: FollowUpCandidate[]; extras: Map<string, Extra> }> {
  const extras = new Map<string, Extra>();
  try {
    const rows = await systemDb((tx) =>
      tx.restaurant.findMany({
        where: { status: "preview" },
        orderBy: { createdAt: "asc" },
        take: 200,
        select: {
          id: true,
          name: true,
          displayName: true,
          createdAt: true,
          contactPhone: true,
          contactFb: true,
          _count: { select: { menuItems: true } },
        },
      }),
    );
    // Somebody who typed a name and left has nothing to talk about. A menu
    // means they did the work — that's a lead worth a message.
    const worth = rows.filter((r) => r._count.menuItems > 0);
    const chases = await chaseHistory(worth.map((r) => r.id));

    const out: FollowUpCandidate[] = worth.map((r) => {
      extras.set(r.id, {
        restaurantId: r.id,
        contact: r.contactPhone || r.contactFb || null,
        itemCount: r._count.menuItems,
      });
      const seen = chases.get(r.id);
      return {
        id: r.id,
        name: r.displayName || r.name,
        track: "diy_preview",
        // The clock runs from the last chase once there's been one; before
        // that, from the day they built it.
        since: (seen?.last ?? r.createdAt).toISOString(),
        dueAt: seen ? nextDue(seen.count, seen.last).toISOString() : null,
        step: seen?.count ?? 0,
        paidAt: null,
        activatedAt: null,
        stage: "preview_built",
      };
    });
    return { rows: out, extras };
  } catch {
    return { rows: [], extras };
  }
}

/**
 * How many times each DIY preview has been chased, and when last.
 *
 * A preview restaurant has no sequence row to advance, so its chases live in
 * the event timeline and are counted back from there. Best-effort: no events
 * table means nobody has been chased, which is exactly the state this screen
 * was built to fix.
 */
async function chaseHistory(ids: string[]): Promise<Map<string, { count: number; last: Date }>> {
  const out = new Map<string, { count: number; last: Date }>();
  if (ids.length === 0) return out;
  try {
    const rows = await systemDb((tx) =>
      tx.customerEvent.findMany({
        where: { restaurantId: { in: ids }, eventType: "note" },
        orderBy: { occurredAt: "desc" },
        select: { restaurantId: true, occurredAt: true, meta: true },
      }),
    );
    for (const r of rows) {
      if (!r.restaurantId) continue;
      const meta = r.meta as { kind?: string } | null;
      if (meta?.kind !== "follow_up_sent") continue;
      const seen = out.get(r.restaurantId);
      // Rows arrive newest-first, so the first one seen is the latest.
      if (seen) seen.count += 1;
      else out.set(r.restaurantId, { count: 1, last: r.occurredAt });
    }
  } catch {
    /* events table not migrated — nobody has been chased */
  }
  return out;
}

/**
 * When the next chase is due, borrowing the outreach cadence.
 *
 * The same rhythm the CRM already uses, so a VA working both lists isn't
 * holding two schedules in their head. Past the end of the sequence it stops
 * being due at all — a fifth chase is not persistence, it's a block.
 */
function nextDue(chasesSent: number, last: Date): Date {
  const step = SEQUENCE[Math.min(chasesSent, SEQUENCE.length - 1)];
  const wait = step?.waitDays ?? 3;
  return new Date(last.getTime() + wait * 86_400_000);
}
