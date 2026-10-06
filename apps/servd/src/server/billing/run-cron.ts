import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import { renewFeatureSubscriptions } from "@/server/billing/feature-subscriptions";
import { coverageEnd, manualBillingAction } from "@/lib/billing/manual";

export interface CronSummary {
  processed: number;
  manualPastDue: number;
  manualSuspended: number;
  /** Per-feature monthly subscriptions that ran out. */
  featuresLapsed: number;
}

/**
 * The daily billing run.
 *
 * Every restaurant is on manual billing (D37, D38): paid by bank or QR
 * transfer, confirmed in the agent portal. Nothing here charges a card, raises
 * an invoice or calls a gateway — those paths are retired. What is left is
 * deciding, from confirmed payments, who has lapsed.
 */
export async function runBillingCron(now: Date = new Date()): Promise<CronSummary> {
  const subs = await systemDb((tx) =>
    tx.subscription.findMany({
      where: { status: { in: ["trialing", "active", "past_due"] } },
      select: { id: true, restaurantId: true, status: true, trialEndsAt: true },
    }),
  );
  const s: CronSummary = { processed: subs.length, manualPastDue: 0, manualSuspended: 0, featuresLapsed: 0 };
  await runManualBilling(subs, now, s);
  s.featuresLapsed = (await renewFeatureSubscriptions(now)).lapsed;
  return s;
}

/**
 * The manual-billing half of the daily run (D37). Coverage comes from the
 * restaurant's confirmed monthly receipts; past it the subscription goes
 * past_due, and MAX_PAST_DUE_DAYS later the restaurant is suspended. The
 * portal's payment.confirmed callback is what lifts either.
 */
export async function runManualBilling(
  subs: { id: string; restaurantId: string; status: string; trialEndsAt: Date | null }[],
  now: Date,
  s: Pick<CronSummary, "manualPastDue" | "manualSuspended">,
): Promise<void> {
  if (subs.length === 0) return;
  const confirmed = await systemDb((tx) =>
    tx.servdManualPayment.findMany({
      where: {
        restaurantId: { in: subs.map((x) => x.restaurantId) },
        status: "confirmed",
        type: "monthly",
        billingMonthStart: { not: null },
      },
      select: { restaurantId: true, billingMonthStart: true, monthsCovered: true },
    }),
  );
  for (const sub of subs) {
    const paidUntil = coverageEnd(
      confirmed
        .filter((p) => p.restaurantId === sub.restaurantId)
        .map((p) => ({ billingMonthStart: p.billingMonthStart!, monthsCovered: p.monthsCovered })),
    );
    const decision = manualBillingAction(
      { status: sub.status as "trialing" | "active" | "past_due", trialEndsAt: sub.trialEndsAt, paidUntil },
      now,
    );
    if (decision.action === "mark_past_due") {
      await systemDb((tx) => tx.subscription.update({ where: { id: sub.id }, data: { status: "past_due" } }));
      s.manualPastDue++;
    } else if (decision.action === "suspend") {
      await systemDb((tx) =>
        tx.restaurant.updateMany({ where: { id: sub.restaurantId, status: { not: "suspended" } }, data: { status: "suspended" } }),
      );
      s.manualSuspended++;
    }
  }
}
