import { MAX_PAST_DUE_DAYS } from "@/lib/billing/lifecycle";

/**
 * Manual (QR + receipt) billing for agent-era restaurants — D37. Pure.
 *
 * The month arithmetic and the receipt form's rules are shared by every
 * product and live in the connection kit; re-exported here so Servd code keeps
 * one import. What is Servd's own is below: what the daily run does when a
 * restaurant's coverage lapses.
 */
export {
  manilaMonthStart,
  addMonthKey,
  manilaMonthKey,
  monthKeyOfDate,
  coverageEnd,
  nextBillingMonth,
  parsePesoAmount,
  parseReceiptForm,
  canSubmitActivation,
  type CoveringPayment,
  type ReceiptInput,
} from "@servd/core/agent-kit/billing";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ManualSnapshot {
  status: "trialing" | "active" | "past_due" | "cancelled";
  trialEndsAt: Date | null;
  /** From coverageEnd() over the restaurant's confirmed monthly payments. */
  paidUntil: Date | null;
}

export type ManualAction = "none" | "mark_past_due" | "suspend";

/**
 * What the daily run does for a manual-billing subscription.
 *
 * Access runs to the later of the trial end and paid coverage. Past that, the
 * subscription is past_due; MAX_PAST_DUE_DAYS later, the restaurant is
 * suspended — the same grace the gateway path gives an unpaid invoice. A
 * suspended owner can still open Billing and upload a receipt, and the
 * confirmation reactivates them.
 *
 * No fallback to the Free plan here, unlike the gateway path: a manual-billing
 * restaurant signed up on paid terms (₱500 + monthly), and quietly turning an
 * unpaid one into a free account would undo those terms.
 */
export function manualBillingAction(sub: ManualSnapshot, now: Date): { action: ManualAction; since: Date | null } {
  if (sub.status === "cancelled") return { action: "none", since: null };
  const ends = [sub.trialEndsAt, sub.paidUntil].filter((d): d is Date => !!d);
  if (ends.length === 0) return { action: "none", since: null };
  const end = new Date(Math.max(...ends.map((d) => d.getTime())));
  if (now < end) return { action: "none", since: end };
  if (sub.status !== "past_due") return { action: "mark_past_due", since: end };
  const days = Math.floor((now.getTime() - end.getTime()) / DAY_MS);
  return days >= MAX_PAST_DUE_DAYS ? { action: "suspend", since: end } : { action: "none", since: end };
}

