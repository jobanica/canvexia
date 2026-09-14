/**
 * FEFO — First Expiry, First Out.
 *
 * The dispensing rule for anything with an expiry date, and the reason a
 * pharmacy needs batches rather than a stock count. Sell the batch that expires
 * soonest, or the shelf silently accumulates stock that will be written off.
 *
 * FIFO — oldest delivery first — is the rule this is mistaken for, and it is
 * the wrong one: a delivery received last week can easily expire before one
 * received last year. Received date only breaks ties between equal expiries.
 *
 * Kept pure and separate from the sale path so it can be tested exhaustively
 * without a database. The sale path re-reads the same rows `FOR UPDATE` inside
 * its transaction; this decides the allocation, it does not perform it.
 */

export interface AllocatableBatch {
  id: string;
  /** Null means no expiry recorded — dispensed last, never first. */
  expiryDate: Date | null;
  receivedAt: Date;
  quantity: number;
  costCentavos: number;
  lotNumber: string | null;
}

export interface Allocation {
  batchId: string;
  quantity: number;
  costCentavos: number;
  lotNumber: string | null;
  expiryDate: Date | null;
}

export type AllocationResult =
  | { ok: true; allocations: Allocation[] }
  | { ok: false; reason: "insufficient_stock"; available: number; needed: number };

/**
 * Batches that may be dispensed today, soonest expiry first.
 *
 * Expired batches are excluded outright rather than sorted last. Dispensing an
 * expired medicine is not a worse option, it is not an option — and leaving
 * them in the list to be picked only when everything else is exhausted is
 * exactly the situation where a busy counter would dispense one.
 *
 * A NULL expiry sorts last. Unknown is not the same as far away, but in a
 * pharmacy the item without a printed date is typically a non-drug sundry, and
 * holding it back until the dated stock is gone is the conservative reading.
 */
export function dispensableBatches<T extends AllocatableBatch>(
  batches: T[],
  asOf: Date,
): T[] {
  const today = manilaDay(asOf);
  return batches
    .filter((b) => b.quantity > 0)
    .filter((b) => b.expiryDate === null || manilaDay(b.expiryDate) >= today)
    .sort((a, b) => {
      if (a.expiryDate === null && b.expiryDate !== null) return 1;
      if (a.expiryDate !== null && b.expiryDate === null) return -1;
      if (a.expiryDate !== null && b.expiryDate !== null) {
        const d = a.expiryDate.getTime() - b.expiryDate.getTime();
        if (d !== 0) return d;
      }
      return a.receivedAt.getTime() - b.receivedAt.getTime();
    });
}

/**
 * Allocate `needed` units across batches, soonest expiry first.
 *
 * Returns a reason rather than throwing, and fails whole rather than partially:
 * a short allocation that still returns `ok` would let a sale go through having
 * dispensed less than it charged for.
 */
export function allocateFefo(
  batches: AllocatableBatch[],
  needed: number,
  asOf: Date,
): AllocationResult {
  if (needed <= 0) return { ok: true, allocations: [] };

  const usable = dispensableBatches(batches, asOf);
  const available = usable.reduce((sum, b) => sum + b.quantity, 0);
  if (available < needed) {
    return { ok: false, reason: "insufficient_stock", available, needed };
  }

  const allocations: Allocation[] = [];
  let remaining = needed;
  for (const batch of usable) {
    if (remaining === 0) break;
    const take = Math.min(batch.quantity, remaining);
    allocations.push({
      batchId: batch.id,
      quantity: take,
      costCentavos: batch.costCentavos,
      lotNumber: batch.lotNumber,
      expiryDate: batch.expiryDate,
    });
    remaining -= take;
  }
  return { ok: true, allocations };
}

/** On-hand excludes expired stock: it is not sellable, so it is not stock. */
export function onHand(batches: AllocatableBatch[], asOf: Date): number {
  return dispensableBatches(batches, asOf).reduce((sum, b) => sum + b.quantity, 0);
}

/**
 * Batches expiring within `days`, soonest first — the alert the whole batch
 * model exists to make possible. Already-expired batches are included: they are
 * the most urgent thing on the list, not the least.
 */
export function expiringWithin<T extends AllocatableBatch>(
  batches: T[],
  days: number,
  asOf: Date,
): T[] {
  const cutoff = addDays(manilaDay(asOf), days);
  return batches
    .filter((b) => b.quantity > 0 && b.expiryDate !== null)
    .filter((b) => manilaDay(b.expiryDate as Date) <= cutoff)
    .sort(
      (a, b) => (a.expiryDate as Date).getTime() - (b.expiryDate as Date).getTime(),
    );
}

/**
 * The calendar date in Asia/Manila, as "YYYY-MM-DD".
 *
 * An expiry is a date, not an instant: a box marked 09/2026 is good to the end
 * of that day, in the pharmacy's own timezone. Comparing raw timestamps makes
 * it expire at whatever time the Date happened to carry.
 *
 * Manila explicitly, NOT the server's local time. Servers run in UTC and the
 * pharmacies are in the Philippines (UTC+8), so a local-time comparison marks
 * stock expired eight hours early — between midnight and 08:00 Manila the
 * server is still on yesterday's date, and a batch expiring today reads as
 * expired for the whole morning shift. A test caught this; nothing about it is
 * visible in normal use, which is what makes it worth pinning.
 *
 * en-CA is the locale that formats as YYYY-MM-DD, which makes these strings
 * comparable with < and >= directly.
 */
const MANILA = "Asia/Manila";

const manilaFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: MANILA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function manilaDay(d: Date): string {
  return manilaFormatter.format(d);
}

/** Shift a YYYY-MM-DD by whole days, via UTC so no DST rule can shift it. */
function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
