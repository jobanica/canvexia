/**
 * Pure billing lifecycle decision — no DB, no provider — so the dunning logic is
 * easy to reason about and unit-test. The cron loads subscriptions, calls this,
 * and performs the returned action.
 *
 * States: trialing → active → past_due → suspended (or cancelled).
 */

export const MAX_FAILED_CHARGES = 3;

export interface SubscriptionSnapshot {
  status: "trialing" | "active" | "past_due" | "cancelled";
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  failedCharges: number;
  cancelAtPeriodEnd: boolean;
  hasSavedCard: boolean;
}

export type BillingAction =
  | "none"
  | "charge" // attempt to charge the saved card now
  | "await_payment" // due but no card — create invoice + prompt owner
  | "suspend" // too many failures
  | "cancel"; // scheduled cancellation has come due

export function nextBillingAction(
  sub: SubscriptionSnapshot,
  now: Date,
): { action: BillingAction; reason: string } {
  if (sub.status === "cancelled") return { action: "none", reason: "cancelled" };

  // A period boundary that has been reached (trial end or paid-period end).
  const boundary =
    sub.status === "trialing" ? sub.trialEndsAt : sub.currentPeriodEnd;
  const due = !!boundary && now >= boundary;

  if (sub.status === "past_due") {
    if (sub.failedCharges >= MAX_FAILED_CHARGES) {
      return { action: "suspend", reason: "max charge failures" };
    }
    return sub.hasSavedCard
      ? { action: "charge", reason: "retry after failure" }
      : { action: "await_payment", reason: "past due, no card" };
  }

  if (!due) return { action: "none", reason: "not yet due" };

  if (sub.cancelAtPeriodEnd) return { action: "cancel", reason: "cancel scheduled" };

  return sub.hasSavedCard
    ? { action: "charge", reason: "period due" }
    : { action: "await_payment", reason: "period due, no card" };
}
