/**
 * How long the shift log is kept.
 *
 * WHAT THIS DELETES: the shift record — who was on the till, when they started
 * and finished, and therefore the ability to review that shift after the fact.
 *
 * WHAT THIS NEVER DELETES: orders, payments, or anything the money is made of.
 * Those are the accounting record, they're what VAT and the daily totals are
 * computed from, and a business is required to keep them far longer than two
 * days. The shift log is a working document for the person closing a till, and
 * it's the only thing on the clock here.
 *
 * The distinction is enforced by what the purge actually touches — one table,
 * cashier_shifts — and by the fact that nothing references it with a foreign
 * key, so a delete cannot cascade anywhere. That is deliberate and worth
 * keeping deliberate: the day something does hold an FK to a shift, this purge
 * becomes capable of destroying sales.
 *
 * Pure so the boundary is testable without waiting two days for it.
 */

export const SHIFT_RETENTION_HOURS = 48;

const RETENTION_MS = SHIFT_RETENTION_HOURS * 60 * 60 * 1000;

/** Shifts that opened before this are past their keep-by. */
export function shiftRetentionCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - RETENTION_MS);
}

/** Is this shift still within the window the owner can review? */
export function isShiftRetained(openedAt: Date, now: Date = new Date()): boolean {
  return openedAt >= shiftRetentionCutoff(now);
}
