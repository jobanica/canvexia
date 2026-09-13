/**
 * Display helpers that render instants in the restaurant's local timezone
 * (Philippines, Asia/Manila, UTC+8, no DST). The server runs in UTC (Vercel),
 * so formatting without an explicit timeZone shows UTC — e.g. a 2:07 PM Manila
 * clock-in renders as "06:07 AM". Always format wall-clock times through these.
 */

export const MANILA_TZ = "Asia/Manila";

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** "YYYY-MM-DD" for the Manila calendar day an instant falls on (stable key). */
export function manilaDayKey(d: Date | string): string {
  return new Date(new Date(d).getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

/** "2:07 PM" — clock time in Manila. */
export function manilaTime(d: Date | string): string {
  return new Date(d).toLocaleTimeString("en-PH", {
    timeZone: MANILA_TZ,
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Jun 26, 2026, 2:07 PM" — date + clock time in Manila. */
export function manilaDateTime(d: Date | string): string {
  return new Date(d).toLocaleString("en-PH", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Jun 26, 2:07 PM" — date + clock time in Manila, no year (compact lists). */
export function manilaShortDateTime(d: Date | string): string {
  return new Date(d).toLocaleString("en-PH", {
    timeZone: MANILA_TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Jun 26, 2026" — calendar date in Manila. */
export function manilaDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-PH", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * The UTC instant at which the Manila calendar day containing `ref` began.
 *
 * The server runs in UTC, so `new Date().setHours(0,0,0,0)` yields midnight UTC
 * — which is 8 AM in Manila. Using that as "start of today" silently drops
 * every order taken between midnight and 8 AM into yesterday. Always derive
 * day boundaries for reports through here.
 */
export function manilaStartOfDay(ref: Date | string = new Date()): Date {
  const ms = new Date(ref).getTime() + MANILA_OFFSET_MS;
  const dayStart = Math.floor(ms / 86_400_000) * 86_400_000;
  return new Date(dayStart - MANILA_OFFSET_MS);
}

/** The UTC instant at which the Manila day containing `ref` ends (exclusive). */
export function manilaEndOfDay(ref: Date | string = new Date()): Date {
  return new Date(manilaStartOfDay(ref).getTime() + 86_400_000);
}

/** Start of the Manila day `days` before the one containing `ref`. */
export function manilaStartOfDaysAgo(days: number, ref: Date | string = new Date()): Date {
  return new Date(manilaStartOfDay(ref).getTime() - days * 86_400_000);
}

/** Manila-day boundaries for a "YYYY-MM-DD" string, as UTC instants. */
export function manilaDayRange(dayKey: string): { from: Date; to: Date } {
  const from = new Date(`${dayKey}T00:00:00.000Z`);
  const start = new Date(from.getTime() - MANILA_OFFSET_MS);
  return { from: start, to: new Date(start.getTime() + 86_400_000) };
}
