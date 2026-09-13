/**
 * Is the shop open right now?
 *
 * The hard part is closing after midnight, which most restaurants here do.
 * "Saturday 10:00–02:30" is one continuous session that STARTS on Saturday and
 * ENDS on Sunday. So at 2 AM on Sunday you are not in Sunday's session at all —
 * you are still in Saturday's, and it is Saturday's closing time that decides
 * whether the lights are on.
 *
 * That is what this used to get wrong. It only ever read the current day's row,
 * so a shop open Mon–Sat 10:00–02:30 and Sun 17:00–01:30 went dark at 2 AM on a
 * Sunday morning: it asked Sunday's row, saw 17:00–01:30, found 02:00 outside
 * it and called the shop closed — while Saturday's session still had half an
 * hour to run. The workaround was to write Sunday's close as 02:30, which fixed
 * the symptom by lying about Sunday.
 *
 * So a moment is open if EITHER holds:
 *   - today's window contains it, or
 *   - yesterday's window ran past midnight and it is before yesterday's close.
 *
 * Pure, and the only place this rule lives: the storefront's Open/Closed badge
 * and the check that blocks online orders both read it here, because a shop
 * that displays "Closed" while still accepting orders is its own bug.
 */

export interface DayWindow {
  open: string; // "HH:MM"
  close: string; // "HH:MM"
  closed: boolean;
}

/** Minutes past midnight, or null when the text isn't a time. */
export function parseHm(hhmm: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** True when a day's window runs past midnight into the next day. */
export function wrapsMidnight(day: DayWindow | undefined): boolean {
  if (!day || day.closed) return false;
  const open = parseHm(day.open);
  const close = parseHm(day.close);
  if (open == null || close == null) return false;
  return close < open;
}

/**
 * Does `minutes` fall inside this day's own window, counting only the part
 * BEFORE midnight? The after-midnight tail belongs to the following calendar
 * day and is handled by `openAt` looking back a day.
 */
function withinSameDay(day: DayWindow | undefined, minutes: number): boolean {
  if (!day || day.closed) return false;
  const open = parseHm(day.open);
  const close = parseHm(day.close);
  // An unreadable time is treated as closed rather than as always-open: a shop
  // wrongly shut for an hour is a complaint, wrongly open is orders nobody cooks.
  if (open == null || close == null) return false;
  // Equal open and close has always meant round the clock. Kept that way.
  if (open === close) return true;
  if (close > open) return minutes >= open && minutes < close;
  // Runs past midnight — today's part is everything from opening to midnight.
  return minutes >= open;
}

/** Is `minutes` inside the tail that yesterday's window left running today? */
function withinYesterdayTail(day: DayWindow | undefined, minutes: number): boolean {
  if (!wrapsMidnight(day)) return false;
  const close = parseHm(day!.close);
  return close != null && minutes < close;
}

/**
 * @param hours seven windows, index 0 = Sunday … 6 = Saturday
 * @param dayIndex the day `minutes` falls on, 0 = Sunday
 * @param minutes minutes past local midnight
 */
export function openAt(hours: DayWindow[], dayIndex: number, minutes: number): boolean {
  const today = hours[((dayIndex % 7) + 7) % 7];
  if (withinSameDay(today, minutes)) return true;
  const yesterday = hours[((dayIndex + 6) % 7 + 7) % 7];
  return withinYesterdayTail(yesterday, minutes);
}

/** Manila offset — the server runs in UTC and every shop here is UTC+8. */
const MANILA_OFFSET_MS = 8 * 3_600_000;

export function isOpenAt(hours: DayWindow[], now: Date = new Date()): boolean {
  const ph = new Date(now.getTime() + MANILA_OFFSET_MS);
  return openAt(hours, ph.getUTCDay(), ph.getUTCHours() * 60 + ph.getUTCMinutes());
}

/**
 * How a day's hours read to a person — with the day the shop actually shuts
 * spelled out, because "10:00 – 02:30" on its own has caught people out.
 */
export function describeWindow(day: DayWindow | undefined): string {
  if (!day || day.closed) return "Closed";
  const open = parseHm(day.open);
  const close = parseHm(day.close);
  if (open == null || close == null) return "Closed";
  if (open === close) return "Open 24 hours";
  return close < open ? `${day.open} – ${day.close} (next day)` : `${day.open} – ${day.close}`;
}
