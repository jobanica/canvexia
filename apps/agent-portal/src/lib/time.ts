/**
 * UTC in the database, Asia/Manila on screen. Every date a person reads goes
 * through here, so "what day was that" is never the server's opinion.
 */
const TZ = "Asia/Manila";

export function manilaDate(d: Date): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function manilaDateTime(d: Date): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/** "2026-10-06" for a date input, in Manila. */
export function manilaIsoDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

/** Manila midnight of a "YYYY-MM-DD" as a UTC instant (Manila is UTC+8, no DST). */
export function manilaMidnight(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00+08:00`);
}
