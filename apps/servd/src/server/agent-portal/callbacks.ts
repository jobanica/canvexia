import "server-only";
import type { Prisma } from "@prisma/client";
import type { PortalCallback } from "@servd/core/agent-kit";
import { recordCallback, setCallbackOutcome } from "@servd/db";
import { coverageEnd } from "@/lib/billing/manual";

type Tx = Prisma.TransactionClient;

/**
 * Apply one portal callback to Servd. Runs in the caller's (system)
 * transaction, together with recording it in the inbox, so a callback is
 * applied exactly once however many times it is delivered.
 *
 * The external customer id the portal knows is the restaurant id — Servd sent
 * it in customer.signed_up.
 */
export async function applyPortalCallback(
  tx: Tx,
  slug: string,
  cb: PortalCallback,
): Promise<"applied" | "duplicate" | "unknown_restaurant" | "unknown_payment"> {
  if (!(await recordCallback(tx, slug, cb))) return "duplicate";

  const restaurantId = cb.data.external_customer_id;
  const restaurant = await tx.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true, status: true } });
  if (!restaurant) {
    await setCallbackOutcome(tx, cb.event_id, "unknown_restaurant");
    return "unknown_restaurant";
  }

  if (cb.type === "contract.signed") {
    await tx.restaurant.update({
      where: { id: restaurantId },
      data: { contractSignedAt: new Date(cb.data.signed_at) },
      select: { id: true },
    });
    await setCallbackOutcome(tx, cb.event_id, "applied");
    return "applied";
  }

  const payment = await tx.servdManualPayment.findFirst({
    where: { restaurantId, bankReference: cb.data.bank_reference },
  });
  if (!payment) {
    await setCallbackOutcome(tx, cb.event_id, "unknown_payment");
    return "unknown_payment";
  }

  const now = new Date();
  if (cb.type === "payment.confirmed") {
    await tx.servdManualPayment.update({
      where: { id: payment.id },
      data: { status: "confirmed", reason: null, decidedAt: now },
      select: { id: true },
    });
  } else if (cb.type === "payment.rejected") {
    await tx.servdManualPayment.update({
      where: { id: payment.id },
      data: { status: "rejected", reason: cb.data.reason, decidedAt: now },
      select: { id: true },
    });
  } else {
    await tx.servdManualPayment.update({
      where: { id: payment.id },
      data: { status: "reversed", reason: cb.data.reason, decidedAt: now },
      select: { id: true },
    });
  }

  await syncAccess(tx, restaurantId, now);
  await setCallbackOutcome(tx, cb.event_id, "applied");
  return "applied";
}

/**
 * Recompute what the restaurant has paid for from its confirmed payments, and
 * set the subscription and status to match. Derived every time rather than
 * incremented, so a reversal and a redelivered confirmation both land on the
 * right answer.
 */
export async function syncAccess(tx: Tx, restaurantId: string, now: Date): Promise<void> {
  const confirmed = await tx.servdManualPayment.findMany({
    where: { restaurantId, status: "confirmed" },
    select: { type: true, billingMonthStart: true, monthsCovered: true, decidedAt: true },
  });
  const activation = confirmed.find((p) => p.type === "activation");
  const paidUntil = coverageEnd(
    confirmed
      .filter((p) => p.type === "monthly" && p.billingMonthStart)
      .map((p) => ({ billingMonthStart: p.billingMonthStart!, monthsCovered: p.monthsCovered })),
  );

  await tx.restaurant.update({
    where: { id: restaurantId },
    data: { activationPaidAt: activation ? (activation.decidedAt ?? now) : null },
    select: { id: true },
  });

  const sub = await tx.subscription.findFirst({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, trialEndsAt: true },
  });
  if (!sub || !paidUntil) return;

  const trialStillRunning = sub.status === "trialing" && !!sub.trialEndsAt && sub.trialEndsAt > now;
  if (paidUntil > now) {
    await tx.subscription.update({
      where: { id: sub.id },
      data: { status: trialStillRunning ? "trialing" : "active", currentPeriodEnd: paidUntil },
    });
    // Paying is what lifts a suspension for non-payment.
    await tx.restaurant.updateMany({ where: { id: restaurantId, status: "suspended" }, data: { status: "active" } });
  } else {
    // Coverage is in the past (a reversal, or an old month confirmed late).
    // Record it; the daily run decides whether that means past_due.
    await tx.subscription.update({ where: { id: sub.id }, data: { currentPeriodEnd: paidUntil } });
  }
}
