/**
 * Per-day generation cap math (pure, testable). The cap is a runaway-loop /
 * spend guard, not a hard product limit.
 */

/** Whether `requested` more generations fit under `cap` given today's count. */
export function withinCap(todayCount: number, requested: number, cap: number): boolean {
  return todayCount + requested <= cap;
}

/** Generations still allowed today (never negative). */
export function remainingToday(todayCount: number, cap: number): number {
  return Math.max(0, cap - todayCount);
}
