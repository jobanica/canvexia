/**
 * The arithmetic behind the alerts screen.
 *
 * Pure and dependency-free. Every number here is one a pharmacist spends money
 * on — how much to order, what to write off, what capital is sitting still —
 * so none of it needs a database to prove.
 */

export type ExpiryBucket = "expired" | "d30" | "d60" | "d90" | "later";

export const BUCKET_LABEL: Record<ExpiryBucket, string> = {
  expired: "Expired",
  d30: "≤30 days",
  d60: "31–60 days",
  d90: "61–90 days",
  later: "Later",
};

/** Whole days from `asOf` to `expiry`, negative once it is past. */
export function daysUntil(expiry: Date, asOf: Date): number {
  const a = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  const b = Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate());
  return Math.round((b - a) / 86_400_000);
}

/**
 * Which pile a batch belongs in.
 *
 * EXPIRING TODAY IS EXPIRED. A batch whose date is today may not be dispensed
 * tomorrow, and a pharmacist reading "≤30 days" against something that is
 * already unsellable is a pharmacist who leaves it on the shelf. Day zero
 * belongs with the ones that have to come off.
 */
export function expiryBucket(expiry: Date, asOf: Date): ExpiryBucket {
  const d = daysUntil(expiry, asOf);
  if (d <= 0) return "expired";
  if (d <= 30) return "d30";
  if (d <= 60) return "d60";
  if (d <= 90) return "d90";
  return "later";
}

/**
 * How many to order to get back to the reorder point.
 *
 * NEVER NEGATIVE, and never zero for something that has run out: a product at
 * zero with a reorder point of zero still needs ordering, and a suggestion of
 * "0" is the one number nobody can act on. It is a SUGGESTION — the buyer
 * decides, and pack sizes are theirs to know.
 */
export function suggestedOrder(onHand: number, reorderPoint: number): number {
  const gap = reorderPoint - onHand;
  if (gap > 0) return gap;
  return onHand <= 0 ? Math.max(reorderPoint, 1) : 0;
}

/**
 * How long the shelf will last at the rate it has been selling.
 *
 * `null` for something that has not sold at all in the window — NOT Infinity
 * and not a huge number. "Never sold" is a different fact from "will last
 * 9,999 days", and rendering the second when you mean the first is how a
 * pharmacist concludes the maths is broken.
 */
export function daysOfSupply(
  onHand: number,
  soldInWindow: number,
  windowDays: number,
): number | null {
  if (soldInWindow <= 0 || windowDays <= 0) return null;
  if (onHand <= 0) return 0;
  return Math.round(onHand / (soldInWindow / windowDays));
}

/**
 * A CSV field.
 *
 * QUOTED WHENEVER IT COULD BE MISREAD. A product name with a comma in it —
 * "Amoxicillin 500mg, 100s" — shifts every column after it, and the file is
 * opened in Excel by somebody who will not notice.
 *
 * A LEADING =, +, - OR @ IS PREFIXED WITH AN APOSTROPHE. Excel treats such a
 * cell as a formula, which is both a mangled export and the standard CSV
 * injection route. Nothing in a pharmacy's stock list is a formula.
 */
export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows to a CSV document, with a header line. */
export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  return [header, ...rows].map((r) => r.map(csvField).join(",")).join("\r\n");
}
