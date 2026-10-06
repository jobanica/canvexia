/**
 * Manual (QR + receipt) billing, the product side — pure and shared by every
 * product on the kit (D37): which months a set of confirmed receipts covers,
 * which month to suggest next, and the receipt form's rules.
 *
 * Months are Manila calendar months: a payment for "2026-11" covers 1 Nov
 * 00:00 to 1 Dec 00:00 Manila time.
 *
 * What a product DOES when coverage lapses (past due, suspension, nothing) is
 * that product's business and stays in the product.
 */

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
