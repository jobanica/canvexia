/**
 * Date ranges, in the pharmacy's own day.
 *
 * WHY A FIXED +08:00 AND NOT A TIMEZONE LIBRARY.
 *
 * The Philippines has had no daylight saving since 1978 and one offset for the
 * whole country. A sale at 7am Manila on the 3rd is 11pm UTC on the 2nd, so a
 * report that ranges on UTC days puts the morning's takings in yesterday — the
 * kind of wrong that is never noticed and never right. Fixing the offset is
 * exact here and has no drift to maintain.
 *
 * Pure and dependency-free, so the arithmetic that decides which day a peso
 * lands in can be tested without a database.
 */

/** Asia/Manila, in minutes. Constant since 1978. */
const MANILA_OFFSET_MIN = 8 * 60;

/** The Manila calendar day an instant falls in, as `YYYY-MM-DD`. */
export function manilaDayIso(at: Date = new Date()): string {
  const shifted = new Date(at.getTime() + MANILA_OFFSET_MIN * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` for the Manila day `days` before today. */
export function isoDaysAgo(days: number, at: Date = new Date()): string {
  return manilaDayIso(new Date(at.getTime() - days * 86_400_000));
}

/**
 * The UTC instants that bound one Manila day: `[start, end)`.
 *
 * Half-open on purpose. A closed upper bound either misses the last
 * millisecond of the day or double-counts a sale at midnight into both days,
 * and which of the two you got depended on how the query was written.
 */
export function manilaDayBounds(iso: string): { start: Date; end: Date } {
  const start = new Date(`${iso}T00:00:00.000+08:00`);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export interface DateRange {
  /** `YYYY-MM-DD`, Manila. */
  from: string;
  to: string;
  /** Half-open UTC bounds covering every Manila day from `from` to `to`. */
  start: Date;
  end: Date;
  /** Days in the range, inclusive of both ends. */
  days: number;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Read a range off the query string, with a sane default and no way to break it.
 *
 * Anything unparsable falls back rather than throwing: these values arrive in a
 * URL a user can edit, and a mistyped date should show the default month, not a
 * 500 on the first screen after signing in. A reversed range is swapped instead
 * of returning nothing, because somebody who does it means the span between
 * the two dates.
 */
export function parseRange(
  input: { from?: string | null; to?: string | null },
  at: Date = new Date(),
): DateRange {
  const today = manilaDayIso(at);
  let from = input.from && ISO.test(input.from) ? input.from : isoDaysAgo(29, at);
  let to = input.to && ISO.test(input.to) ? input.to : today;
  if (from > to) [from, to] = [to, from];

  const start = manilaDayBounds(from).start;
  const end = manilaDayBounds(to).end;
  return {
    from,
    to,
    start,
    end,
    days: Math.round((end.getTime() - start.getTime()) / 86_400_000),
  };
}

/** Every Manila day in the range, `YYYY-MM-DD`, so a chart has no holes. */
export function enumerateDays(range: DateRange): string[] {
  const out: string[] = [];
  // Capped: a range typed into the URL as ten years should draw nothing absurd.
  for (let i = 0; i < range.days && i < 366; i += 1) {
    out.push(manilaDayIso(new Date(range.start.getTime() + i * 86_400_000 + 43_200_000)));
  }
  return out;
}

/** The preset buttons — the three windows a pharmacy actually looks at. */
export const RANGE_PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

/** Href for a preset, ending today. */
export function presetRange(days: number, at: Date = new Date()): { from: string; to: string } {
  return { from: isoDaysAgo(days - 1, at), to: manilaDayIso(at) };
}
