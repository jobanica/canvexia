import { MAX_PAST_DUE_DAYS } from "@/lib/billing/lifecycle";

/**
 * Manual (QR + receipt) billing for agent-era restaurants — D37. Pure.
 *
 * A restaurant on manual billing is paid up to the end of the last month its
 * confirmed monthly payments cover. Months are Manila calendar months: a
 * payment for "2026-11" covers 1 Nov 00:00 to 1 Dec 00:00 Manila time.
 *
 * There is no gateway, nothing is charged, and no invoice is raised — the
 * owner uploads a receipt, the agent portal confirms it, and the callback
 * moves the coverage. This file only answers "covered until when" and "what
 * should happen now that it isn't".
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** "2026-11" → the instant Manila's 1 Nov 2026 begins. */
export function manilaMonthStart(month: string): Date {
  return new Date(`${month}-01T00:00:00+08:00`);
}

/** "2026-11" + 3 → "2027-02". */
export function addMonthKey(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/** The Manila calendar month an instant falls in, as "YYYY-MM". */
export function manilaMonthKey(d: Date): string {
  return new Date(d.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

/** A DATE column ("billingMonthStart") → "YYYY-MM". Stored as UTC midnight of the 1st. */
export function monthKeyOfDate(d: Date): string {
  return d.toISOString().slice(0, 7);
}

export interface CoveringPayment {
  billingMonthStart: Date;
  monthsCovered: number;
}

/**
 * When paid coverage ends: the start of the month after the last month any
 * confirmed monthly payment covers. Null when there are none. Overlapping
 * payments do not stack — two receipts for November cover November once.
 */
export function coverageEnd(confirmedMonthly: CoveringPayment[]): Date | null {
  let last: string | null = null;
  for (const p of confirmedMonthly) {
    const end = addMonthKey(monthKeyOfDate(p.billingMonthStart), p.monthsCovered);
    if (!last || end > last) last = end;
  }
  return last ? manilaMonthStart(last) : null;
}

/**
 * The month the receipt form should suggest: the first month not yet paid
 * for, or this month if nothing is paid or coverage has lapsed.
 */
export function nextBillingMonth(paidUntil: Date | null, now: Date): string {
  const thisMonth = manilaMonthKey(now);
  if (!paidUntil) return thisMonth;
  const next = manilaMonthKey(paidUntil);
  return next > thisMonth ? next : thisMonth;
}

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

/** Pesos as typed on the receipt form → centavos. Null if it is not an amount. */
export function parsePesoAmount(input: string | null | undefined): number | null {
  if (input == null) return null;
  const s = input.replace(/[₱,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const v = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return v > 0 ? v : null;
}

export interface ReceiptInput {
  type: "activation" | "monthly";
  monthsCovered: number;
  /** "YYYY-MM", monthly only. */
  billingMonth: string | null;
  amount: number;
  bankReference: string;
}

/**
 * The receipt form → a receipt, or the sentence to show the owner. The image
 * is checked separately (it is a File, not a string).
 */
export function parseReceiptForm(
  f: Record<string, string | undefined>,
): { ok: true; input: ReceiptInput } | { ok: false; error: string } {
  const type = f.type === "activation" || f.type === "monthly" ? f.type : null;
  if (!type) return { ok: false, error: "Choose what this payment is for." };
  const amount = parsePesoAmount(f.amount);
  if (amount === null) return { ok: false, error: "Enter the amount you paid, e.g. 800 or 800.00." };
  const bankReference = (f.bank_reference ?? "").trim();
  if (bankReference.length < 3 || bankReference.length > 100) {
    return { ok: false, error: "Enter the bank reference number from your receipt." };
  }
  if (type === "activation") {
    return { ok: true, input: { type, monthsCovered: 1, billingMonth: null, amount, bankReference } };
  }
  const months = Number(f.months_covered);
  if (!Number.isInteger(months) || months < 1 || months > 12) {
    return { ok: false, error: "Choose how many months this pays for (1–12)." };
  }
  const billingMonth = (f.billing_month_start ?? "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(billingMonth)) {
    return { ok: false, error: "Choose the first month this payment covers." };
  }
  return { ok: true, input: { type, monthsCovered: months, billingMonth, amount, bankReference } };
}

/**
 * Whether an activation receipt may be sent now. One activation per
 * restaurant: not once it is confirmed, and not while one is waiting for
 * review — a second upload would be the same payment twice.
 */
export function canSubmitActivation(payments: { type: string; status: string }[]): boolean {
  return !payments.some((p) => p.type === "activation" && (p.status === "confirmed" || p.status === "submitted"));
}
