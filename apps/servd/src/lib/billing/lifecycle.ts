/**
 * Pure billing lifecycle decision — no DB, no provider — so the dunning logic is
 * easy to reason about and unit-test. The cron loads subscriptions, calls this,
 * and performs the returned action.
 *
 * States: trialing → active → past_due → suspended (or cancelled).
 */

export const MAX_FAILED_CHARGES = 3;

/**
 * How long a subscriber may sit with an unpaid invoice before suspension.
 *
 * This is the second, independent route to `suspend`, and it exists because the
 * first one cannot fire on every provider. `failedCharges` only increments when
 * a saved-card charge is ATTEMPTED and fails. A gateway with no off-session
 * charging never attempts one — Xendit's `chargeSavedCard()` is a deliberate
 * no-op — so `failedCharges` stays 0 forever and the count-based arm below is
 * unreachable. Without this, a merchant on that provider sits `past_due`
 * indefinitely and keeps using the product for free.
 *
 * Fourteen days is two missed weekly reminders, and long enough that a card
 * expiring over a holiday is not an outage.
 */
export const MAX_PAST_DUE_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SubscriptionSnapshot {
  status: "trialing" | "active" | "past_due" | "cancelled";
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  failedCharges: number;
  cancelAtPeriodEnd: boolean;
  hasSavedCard: boolean;
  /**
   * When the oldest still-unpaid invoice was raised; null if nothing is open.
   *
   * Optional so existing callers keep compiling, and absent behaves exactly as
   * before — a subscriber with no open invoice is never suspended for age.
   */
  oldestOpenInvoiceAt?: Date | null;
}

export type BillingAction =
  | "none"
  | "charge" // attempt to charge the saved card now
  | "await_payment" // due but no card — create invoice + prompt owner
  | "suspend" // too many failures
  | "cancel"; // scheduled cancellation has come due

/**
 * Whole days between an invoice being raised and now; null if there is none.
 *
 * Floors rather than rounds, so "14 days" means fourteen days have actually
 * elapsed. A clock skew that puts the invoice slightly in the future reads as 0,
 * not as a negative that would trip the comparison the wrong way.
 */
function daysSince(at: Date | null | undefined, now: Date): number | null {
  if (!at) return null;
  return Math.max(0, Math.floor((now.getTime() - at.getTime()) / DAY_MS));
}

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
    // The provider-independent arm. See MAX_PAST_DUE_DAYS: on a gateway that
    // cannot charge off-session, the count above never rises and this is the
    // only thing that ever escalates non-payment.
    const unpaidDays = daysSince(sub.oldestOpenInvoiceAt, now);
    if (unpaidDays !== null && unpaidDays >= MAX_PAST_DUE_DAYS) {
      return { action: "suspend", reason: `unpaid for ${unpaidDays} days` };
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
