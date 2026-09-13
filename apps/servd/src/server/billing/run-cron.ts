import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import { getBillingProvider } from "@/server/billing";
import { nextBillingAction } from "@/lib/billing/lifecycle";
import { addMonths } from "@/lib/billing/period";
import { PLAN_FIELDS } from "@/server/billing/subscription";
import { renewFeatureSubscriptions } from "@/server/billing/feature-subscriptions";

export interface CronSummary {
  processed: number;
  charged: number;
  failed: number;
  awaiting: number;
  suspended: number;
  cancelled: number;
  /** Per-feature monthly subscriptions (e.g. the content scheduler). */
  featuresRenewed: number;
  featuresInvoiced: number;
  featuresLapsed: number;
}

/**
 * Daily billing run: for every live subscription, decide (pure lifecycle) and
 * act — charge the saved card, prompt for payment, dun, suspend, or cancel.
 * Idempotent across days: a successful charge advances currentPeriodEnd so the
 * subscription isn't "due" again until the next cycle.
 */
export async function runBillingCron(now: Date = new Date()): Promise<CronSummary> {
  const provider = await getBillingProvider();
  const [subs, freePlan] = await systemDb(async (tx) => [
    await tx.subscription.findMany({
      where: { status: { in: ["trialing", "active", "past_due"] } },
      include: { plan: { select: PLAN_FIELDS } },
    }),
    await tx.plan.findFirst({
      where: { isActive: true, priceMonthly: { lte: 0 } },
      orderBy: { priceMonthly: "asc" },
      select: { id: true },
    }),
  ]);

  const s: CronSummary = {
    processed: subs.length, charged: 0, failed: 0, awaiting: 0, suspended: 0, cancelled: 0,
    featuresRenewed: 0, featuresInvoiced: 0, featuresLapsed: 0,
  };

  for (const sub of subs) {
    const decision = nextBillingAction(
      {
        status: sub.status as "trialing" | "active" | "past_due",
        trialEndsAt: sub.trialEndsAt,
        currentPeriodEnd: sub.currentPeriodEnd,
        failedCharges: sub.failedCharges,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        hasSavedCard: !!sub.providerPaymentMethodId,
      },
      now,
    );
    const amount = sub.plan.priceMonthly;

    // A 14-day paid trial that ended without a saved card → revert to the Free
    // plan (lifetime free) rather than suspend. Free is always there to fall
    // back to, so an un-converted trial just becomes a free account.
    const trialEnded = sub.status === "trialing" && !!sub.trialEndsAt && sub.trialEndsAt <= now;
    if (trialEnded && !sub.providerPaymentMethodId && amount > 0 && freePlan) {
      await systemDb(async (tx) => {
        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            planId: freePlan.id,
            status: "active",
            trialEndsAt: null,
            currentPeriodEnd: addMonths(now, 1),
            failedCharges: 0,
            cancelAtPeriodEnd: false,
          },
        });
        await tx.restaurant.update({ where: { id: sub.restaurantId }, data: { planId: freePlan.id, status: "active" }, select: { id: true } });
      });
      continue;
    }

    if (decision.action === "none") continue;

    if (decision.action === "cancel") {
      await systemDb(async (tx) => {
        await tx.subscription.update({ where: { id: sub.id }, data: { status: "cancelled" } });
      });
      s.cancelled++;
      continue;
    }

    // Free plans (₱0) never bill — keep them active and roll the period forward
    // so they're never suspended or invoiced for non-payment.
    if (amount <= 0) {
      const overdue = !sub.currentPeriodEnd || sub.currentPeriodEnd <= now;
      if (sub.status !== "active" || overdue) {
        const base = sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
        await systemDb(async (tx) => {
          await tx.subscription.update({
            where: { id: sub.id },
            data: { status: "active", currentPeriodEnd: addMonths(base, 1), failedCharges: 0 },
          });
          await tx.restaurant.update({ where: { id: sub.restaurantId }, data: { status: "active" }, select: { id: true } });
        });
      }
      continue;
    }

    if (decision.action === "suspend") {
      await systemDb(async (tx) => {
        await tx.subscription.update({ where: { id: sub.id }, data: { status: "past_due" } });
        await tx.restaurant.update({ where: { id: sub.restaurantId }, data: { status: "suspended" }, select: { id: true } });
      });
      s.suspended++;
      continue;
    }

    const canCharge = decision.action === "charge" && provider && sub.providerPaymentMethodId;

    if (decision.action === "await_payment" || !canCharge) {
      await systemDb(async (tx) => {
        await tx.restaurantInvoice.create({
          data: { restaurantId: sub.restaurantId, amount, status: "open", periodStart: now, periodEnd: addMonths(now, 1) },
        });
        await tx.subscription.update({ where: { id: sub.id }, data: { status: "past_due" } });
      });
      s.awaiting++;
      continue;
    }

    // charge the saved card
    const res = await provider!.chargeSavedCard({
      amount,
      description: `Servd ${sub.plan.name} subscription`,
      paymentMethodId: sub.providerPaymentMethodId!,
      customerId: sub.providerCustomerId ?? undefined,
    });
    const base = sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;

    if (res.status === "paid") {
      await systemDb(async (tx) => {
        const inv = await tx.restaurantInvoice.create({
          data: { restaurantId: sub.restaurantId, amount, status: "paid", periodStart: now, periodEnd: addMonths(base, 1), providerRef: res.providerRef, paidAt: now },
          select: { id: true },
        });
        await tx.subscription.update({ where: { id: sub.id }, data: { status: "active", currentPeriodEnd: addMonths(base, 1), failedCharges: 0 } });
        await tx.restaurant.update({ where: { id: sub.restaurantId }, data: { status: "active" }, select: { id: true } });
      });
      s.charged++;
    } else {
      await systemDb(async (tx) => {
        await tx.restaurantInvoice.create({
          data: { restaurantId: sub.restaurantId, amount, status: "failed", periodStart: now, periodEnd: addMonths(now, 1), providerRef: res.providerRef },
        });
        await tx.subscription.update({ where: { id: sub.id }, data: { status: "past_due", failedCharges: { increment: 1 } } });
      });
      s.failed++;
    }
  }

  // Per-feature monthly subscriptions renew on the same daily pass.
  const feat = await renewFeatureSubscriptions(now);
  s.featuresRenewed = feat.renewed;
  s.featuresInvoiced = feat.invoiced;
  s.featuresLapsed = feat.lapsed;

  return s;
}
