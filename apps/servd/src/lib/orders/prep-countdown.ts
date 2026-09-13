/**
 * The countdown a merchant screen runs on an accepted order.
 *
 * When an order is accepted the merchant picks how long it will take — "20
 * minutes". That number was stored and then shown as a static "~20m", which
 * tells the counter nothing once ten of those minutes have gone: the whole
 * value of promising a time is knowing how much of it is left.
 *
 * Two inputs, and BOTH are required. Without the moment of acceptance a
 * duration is not a deadline, and guessing one from when the customer placed
 * the order would show an advance order booked this morning as three hours
 * late the second it is accepted. No accepted-at, no countdown.
 *
 * Pure: no clock of its own, `now` is always passed in. That is what makes the
 * boundaries testable rather than a thing you watch a screen for a minute to
 * check.
 */

export type PrepTone = "fresh" | "soon" | "late";

export interface PrepCountdown {
  /** "12:34" remaining, or "+2:05" once the promised time has passed. */
  label: string;
  /** Negative once overdue. Seconds, so the display can tick. */
  secondsLeft: number;
  overdue: boolean;
  tone: PrepTone;
}

/** When the food was promised for, in epoch ms. Null if it can't be known. */
export function prepDeadline(
  acceptedAt: string | Date | null | undefined,
  prepMinutes: number | null | undefined,
): number | null {
  if (!acceptedAt) return null;
  if (prepMinutes == null || !Number.isFinite(prepMinutes) || prepMinutes <= 0) return null;
  const start = acceptedAt instanceof Date ? acceptedAt.getTime() : Date.parse(acceptedAt);
  if (Number.isNaN(start)) return null;
  return start + Math.round(prepMinutes) * 60_000;
}

/** "9:05", "0:07", and "+1:20" once the time is up. Always mm:ss. */
function clock(seconds: number): string {
  const s = Math.abs(seconds);
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/**
 * Where an order stands against its promise.
 *
 * The amber threshold is a PROPORTION rather than a fixed number of minutes,
 * because "two minutes left" means something very different on a 5-minute
 * coffee and a 45-minute roast. A floor of one minute keeps the warning
 * meaningful on the shortest promises, where a quarter of the time is seconds.
 */
export function prepCountdown(deadlineMs: number, nowMs: number, prepMinutes = 0): PrepCountdown {
  const secondsLeft = Math.round((deadlineMs - nowMs) / 1000);
  const overdue = secondsLeft < 0;
  const warnAt = Math.max(60, Math.round((prepMinutes * 60) / 4));
  const tone: PrepTone = overdue ? "late" : secondsLeft <= warnAt ? "soon" : "fresh";
  return {
    label: overdue ? `+${clock(secondsLeft)}` : clock(secondsLeft),
    secondsLeft,
    overdue,
    tone,
  };
}

/** The whole thing in one call, or null when there's nothing to count down. */
export function countdownFor(
  acceptedAt: string | Date | null | undefined,
  prepMinutes: number | null | undefined,
  nowMs: number,
): PrepCountdown | null {
  const deadline = prepDeadline(acceptedAt, prepMinutes);
  if (deadline == null) return null;
  return prepCountdown(deadline, nowMs, prepMinutes ?? 0);
}
