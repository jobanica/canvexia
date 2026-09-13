/**
 * How long a cashier's shift stays open.
 *
 * The first version of this ended every shift at midnight, on the reasoning
 * that a cashier who forgets to sign out shouldn't have tomorrow's takings pile
 * onto today's. That's a real problem, but midnight is the wrong line to draw
 * it at: a night cashier who opened at 6 PM had their shift closed underneath
 * them at 12:00 AM and a fresh one opened, so six hours of takings vanished
 * from the summary they were about to print. Losing an evening's sales to fix a
 * bookkeeping tidiness problem is a bad trade — and it happened nightly.
 *
 * A shift is a length of time someone works, so it's bounded by duration. Any
 * real shift fits comfortably inside the cap; anything past it is somebody who
 * never signed out, which is exactly what the cap is there to catch.
 *
 * Pure so the boundary can be tested at the times it actually matters —
 * 11:59 PM and 12:01 AM — without waiting for midnight.
 */

/**
 * Longer than any shift a person actually works, shorter than the gap before
 * their next one. A double shift with a break in the middle still fits; a
 * cashier who worked last night and comes back tonight does not.
 */
export const MAX_SHIFT_HOURS = 16;

const MAX_SHIFT_MS = MAX_SHIFT_HOURS * 60 * 60 * 1000;

/** When a shift opened at `openedAt` stops counting as the current one. */
export function shiftExpiresAt(openedAt: Date): Date {
  return new Date(openedAt.getTime() + MAX_SHIFT_MS);
}

/**
 * Is this still the cashier's current shift?
 *
 * Crossing midnight is not an expiry. That is the entire point.
 *
 * Inclusive at the cap so it is the exact complement of staleShiftCutoff: a
 * shift sitting precisely on the boundary must be either current or swept, and
 * if the two disagreed it would be neither — reported as lapsed, then left open
 * by the sweep, so a new shift is attempted, rejected by the unique index, and
 * the old one comes back anyway. Same answer, three round-trips of confusion.
 */
export function isShiftCurrent(openedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - openedAt.getTime() <= MAX_SHIFT_MS;
}

/** The cutoff before which an un-signed-out shift is abandoned, not active. */
export function staleShiftCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - MAX_SHIFT_MS);
}
