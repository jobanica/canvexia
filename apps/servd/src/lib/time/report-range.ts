import {
  manilaDayKey,
  manilaDayRange,
  manilaStartOfDay,
  manilaStartOfDaysAgo,
} from "./manila";

/**
 * The window a report covers.
 *
 * One module for every report screen, because the alternative is what we had:
 * analytics offered 7/30/90 days, accounting offered today/this month/last
 * month, and neither could answer "how did we do last Saturday" or "what did we
 * take between payday and the 15th". An owner who has to export a CSV and open
 * a spreadsheet to ask that question doesn't ask it.
 *
 * Every boundary is a MANILA day boundary. The server runs in UTC, so a range
 * built from local midnight silently drops everything taken between midnight and
 * 8 AM into the previous day — and a report that quietly loses the early hours
 * is worse than no report.
 *
 * Pure: takes `now`, returns dates and labels. No database, no request.
 */

export type PresetKey =
  | "today"
  | "yesterday"
  | "7"
  | "30"
  | "90"
  | "this_month"
  | "last_month"
  | "custom";

export const PRESETS: { key: PresetKey; label: string; short: string }[] = [
  { key: "today", label: "Today", short: "Today" },
  { key: "yesterday", label: "Yesterday", short: "Yest." },
  { key: "7", label: "Last 7 days", short: "7d" },
  { key: "30", label: "Last 30 days", short: "30d" },
  { key: "90", label: "Last 90 days", short: "90d" },
  { key: "this_month", label: "This month", short: "This mo." },
  { key: "last_month", label: "Last month", short: "Last mo." },
];

export interface ReportRange {
  preset: PresetKey;
  /** Inclusive start (UTC instant at a Manila day boundary). */
  from: Date;
  /** Exclusive-ish end — `now` for open-ended presets, end of day otherwise. */
  to: Date;
  /** "YYYY-MM-DD" in Manila, for the date inputs. */
  fromKey: string;
  toKey: string;
  /** Human label, e.g. "Aug 1 – Aug 13, 2026". */
  label: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The Manila calendar parts of an instant. */
function parts(d: Date): { y: number; m: number; d: number } {
  const [y, m, day] = manilaDayKey(d).split("-").map(Number);
  return { y, m, d: day };
}

function firstOfMonthKey(y: number, m: number): string {
  return `${y}-${pad(m)}-01`;
}

/** Guard: is this a "YYYY-MM-DD" we're willing to build a range from? */
export function isDayKey(v: string | undefined): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Aug 13, 2026" from a Manila day key, without going near a timezone again. */
function niceDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/**
 * A label that reads like something a person would say.
 *
 * One day is just that day; a span inside one year drops the repeated year from
 * the first date. "Aug 1 – Aug 13, 2026" beats "Aug 1, 2026 – Aug 13, 2026" on
 * a phone, where this has to fit next to a heading.
 */
export function rangeLabel(fromKey: string, toKey: string): string {
  if (fromKey === toKey) return niceDay(fromKey);
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty] = toKey.split("-").map(Number);
  const left = fy === ty ? `${MONTHS[fm - 1]} ${fd}` : niceDay(fromKey);
  return `${left} – ${niceDay(toKey)}`;
}

export interface RangeInput {
  range?: string;
  from?: string;
  to?: string;
}

/**
 * Resolve untrusted query params into a window.
 *
 * Anything unrecognised falls back to the last 30 days rather than erroring: a
 * hand-edited or stale URL should show a report, not a stack trace.
 */
export function parseReportRange(input: RangeInput, now: Date = new Date()): ReportRange {
  const raw = input.range;

  // Custom wins when both ends are usable, whatever `range` says — a bookmarked
  // URL carrying dates should honour them.
  if (isDayKey(input.from) && isDayKey(input.to)) {
    // Reversed dates are a slip, not an error. Swapping beats an empty report.
    const [a, b] = input.from <= input.to ? [input.from, input.to] : [input.to, input.from];
    return {
      preset: "custom",
      from: manilaDayRange(a).from,
      to: manilaDayRange(b).to,
      fromKey: a,
      toKey: b,
      label: rangeLabel(a, b),
    };
  }

  const build = (from: Date, to: Date, preset: PresetKey): ReportRange => {
    // The label uses the LAST included day, so a range ending at midnight
    // tonight reads as today rather than tomorrow.
    const toKey = manilaDayKey(new Date(to.getTime() - 1));
    const fromKey = manilaDayKey(from);
    return { preset, from, to, fromKey, toKey, label: rangeLabel(fromKey, toKey) };
  };

  switch (raw) {
    case "today":
      return build(manilaStartOfDay(now), now, "today");
    case "yesterday": {
      const y = manilaDayRange(manilaDayKey(manilaStartOfDaysAgo(1, now)));
      return build(y.from, y.to, "yesterday");
    }
    case "7":
      return build(manilaStartOfDaysAgo(6, now), now, "7");
    case "90":
      return build(manilaStartOfDaysAgo(89, now), now, "90");
    case "this_month": {
      const p = parts(now);
      return build(manilaDayRange(firstOfMonthKey(p.y, p.m)).from, now, "this_month");
    }
    case "last_month": {
      const p = parts(now);
      const thisStart = manilaDayRange(firstOfMonthKey(p.y, p.m)).from;
      const prevY = p.m === 1 ? p.y - 1 : p.y;
      const prevM = p.m === 1 ? 12 : p.m - 1;
      return build(manilaDayRange(firstOfMonthKey(prevY, prevM)).from, thisStart, "last_month");
    }
    default:
      // 30 days, and the fallback for anything we don't recognise.
      return build(manilaStartOfDaysAgo(29, now), now, "30");
  }
}

/** Query string for a preset, for building links. */
export function rangeHref(base: string, preset: PresetKey): string {
  return `${base}?range=${preset}`;
}
