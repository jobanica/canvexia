import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { ALL_STEPS } from "@/lib/email/tracks";

/**
 * What the follow-up sequence is actually worth.
 *
 * Deliberately NOT open/click rates. An opened email that produced nothing is
 * a vanity number; the only outcome this sequence exists to produce is an
 * activated restaurant, so every figure here ends in one.
 *
 *   influenced — received this step and activated at some point afterwards
 *   credited   — this was the LAST email they got before they paid
 *
 * `influenced` over-counts (a lead who got five steps credits all five) and
 * `credited` under-counts (last-touch ignores everything that warmed them up).
 * Shown side by side on purpose: the honest read is somewhere between them,
 * and a step whose two numbers are both near zero is the one to rewrite.
 */

export interface StepStats {
  stepKey: string;
  scheduled: number;
  sent: number;
  skipped: number;
  failed: number;
  influenced: number;
  credited: number;
}

export interface FollowUpStats {
  /** Keyed by stepKey — every known step present, even at zero. */
  steps: Record<string, StepStats>;
  totals: {
    leads: number; // gave an email on the builder
    reachedPreview: number;
    activated: number;
    /** Activations we can attribute to a step (i.e. got mail before paying). */
    attributed: number;
    dueNow: number;
  };
  /** True when the tables aren't migrated yet — the UI says so rather than lying with zeros. */
  unavailable: boolean;
}

const empty = (stepKey: string): StepStats => ({
  stepKey,
  scheduled: 0,
  sent: 0,
  skipped: 0,
  failed: 0,
  influenced: 0,
  credited: 0,
});

/** How many activations to walk for attribution. Plenty for a long while. */
const ATTRIBUTION_LIMIT = 3000;

export async function getFollowUpStats(now = new Date()): Promise<FollowUpStats> {
  const steps: Record<string, StepStats> = {};
  for (const s of ALL_STEPS) steps[s.key] = empty(s.key);

  const totals = { leads: 0, reachedPreview: 0, activated: 0, attributed: 0, dueNow: 0 };

  // Funnel counts come from the restaurant row itself, which IS the lead — so
  // these can't drift out of step with the sends the way a parallel table would.
  try {
    const [leads, reached, activated] = await Promise.all([
      systemDb((tx) =>
        tx.restaurant.count({ where: { builtVia: "diy", contactEmail: { not: null } } }),
      ),
      systemDb((tx) => tx.restaurant.count({ where: { previewReachedAt: { not: null } } })),
      systemDb((tx) =>
        tx.restaurant.count({ where: { builtVia: "diy", status: { not: "preview" } } }),
      ),
    ]);
    totals.leads = leads;
    totals.reachedPreview = reached;
    totals.activated = activated;
  } catch {
    /* pre-migration */
  }

  try {
    const grouped = await systemDb((tx) =>
      tx.emailSend.groupBy({ by: ["stepKey", "status"], _count: { _all: true } }),
    );
    for (const g of grouped) {
      const row = (steps[g.stepKey] ??= empty(g.stepKey));
      const n = g._count._all;
      if (g.status === "sent") row.sent += n;
      else if (g.status === "skipped") row.skipped += n;
      else if (g.status === "failed") row.failed += n;
      else row.scheduled += n;
    }

    totals.dueNow = await systemDb((tx) =>
      tx.emailSend.count({ where: { status: "scheduled", sendAt: { lte: now } } }),
    );
  } catch {
    return { steps, totals, unavailable: true };
  }

  // Attribution. Small by construction: one pass per paying customer.
  try {
    const activations = await systemDb((tx) =>
      tx.activationRequest.findMany({
        where: { activatedAt: { not: null } },
        orderBy: { activatedAt: "desc" },
        take: ATTRIBUTION_LIMIT,
        select: { restaurantId: true, activatedAt: true },
      }),
    );
    if (activations.length > 0) {
      // Keep the earliest activation per restaurant — a re-purchase shouldn't
      // re-credit whichever email happened to land near it.
      const paidAt = new Map<string, Date>();
      for (const a of activations) {
        if (!a.activatedAt) continue;
        const prev = paidAt.get(a.restaurantId);
        if (!prev || a.activatedAt < prev) paidAt.set(a.restaurantId, a.activatedAt);
      }

      const sends = await systemDb((tx) =>
        tx.emailSend.findMany({
          where: { restaurantId: { in: [...paidAt.keys()] }, status: "sent" },
          select: { restaurantId: true, stepKey: true, sentAt: true },
        }),
      );

      const lastBefore = new Map<string, { stepKey: string; sentAt: Date }>();
      for (const s of sends) {
        const when = paidAt.get(s.restaurantId);
        if (!when || !s.sentAt || s.sentAt > when) continue;
        (steps[s.stepKey] ??= empty(s.stepKey)).influenced++;
        const best = lastBefore.get(s.restaurantId);
        if (!best || s.sentAt > best.sentAt) {
          lastBefore.set(s.restaurantId, { stepKey: s.stepKey, sentAt: s.sentAt });
        }
      }
      for (const { stepKey } of lastBefore.values()) {
        (steps[stepKey] ??= empty(stepKey)).credited++;
      }
      totals.attributed = lastBefore.size;
    }
  } catch {
    /* attribution is a nice-to-have; the send counts above still stand */
  }

  return { steps, totals, unavailable: false };
}
