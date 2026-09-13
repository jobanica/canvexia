/**
 * Counter / takeout order numbers — the human-friendly ticket number a stall
 * customer gets instead of a table (e.g. "#012"). Numbers reset daily, computed
 * against the restaurant's local day (Philippines, UTC+8, no DST).
 */

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** The UTC instant of "today" midnight in Manila — the daily reset boundary. */
export function startOfManilaDay(date: Date = new Date()): Date {
  const shifted = new Date(date.getTime() + MANILA_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - MANILA_OFFSET_MS);
}

/** Display a counter order number, zero-padded to 3 digits ("#007", "#1024"). */
export function formatOrderNumber(n: number): string {
  return `#${String(n).padStart(3, "0")}`;
}
