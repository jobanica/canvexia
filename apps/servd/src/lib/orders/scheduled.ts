/**
 * When an advance order is actually wanted for.
 *
 * One formatter, read by the cashier board, the kitchen display and the printed
 * kitchen ticket. Three screens describing the same moment three different ways
 * is how a kitchen ends up cooking a Tuesday lunch on Monday night.
 *
 * The day is always spelled out, never just a time. "Wanted for 6:30 PM" on a
 * docket handed over at 9 AM is ambiguous in the one way that matters, and the
 * kitchen has no way to tell whether it means tonight or a week on Friday.
 */

const MANILA_TZ = "Asia/Manila";

/** "Sat, Aug 22, 6:30 PM" — for a screen, where there's room. */
export function scheduledLabel(iso: string | Date | null | undefined): string | null {
  const d = toDate(iso);
  if (!d) return null;
  return d.toLocaleString("en-PH", {
    timeZone: MANILA_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * "Sat Aug 22, 6:30 PM" — for 32-column thermal paper, where the whole line has
 * to fit beside the words "Scheduled for:".
 */
export function scheduledTicketLabel(iso: string | Date | null | undefined): string | null {
  const d = toDate(iso);
  if (!d) return null;
  const day = d.toLocaleDateString("en-PH", {
    timeZone: MANILA_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const time = d.toLocaleTimeString("en-PH", {
    timeZone: MANILA_TZ,
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day}, ${time}`;
}

/**
 * Is this scheduled for a later day than the one it's being looked at on?
 *
 * The kitchen's real question isn't "is this an advance order" — it's "do I
 * cook this now or not". An order placed at 9 AM for 6:30 PM the same day is a
 * different kind of urgent from one for next Saturday.
 */
export function isForAnotherDay(
  iso: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  const d = toDate(iso);
  if (!d) return false;
  return manilaDayKey(d) !== manilaDayKey(now);
}

/**
 * How an advance order sorts on the till's queue.
 *
 * "overdue" first, "today" next, then the rest — the cashier's question all day
 * is "what do I need to send to the kitchen now", and an order whose time has
 * already passed is the one that costs a customer their booking.
 */
export type DueBucket = "overdue" | "today" | "later";

export function dueBucket(
  iso: string | Date | null | undefined,
  now: Date = new Date(),
): DueBucket {
  const d = toDate(iso);
  if (!d) return "later";
  if (d.getTime() < now.getTime()) return "overdue";
  return manilaDayKey(d) === manilaDayKey(now) ? "today" : "later";
}

/**
 * Minutes until it's wanted, negative once the time has passed. Null when it
 * isn't scheduled at all.
 */
export function minutesUntil(
  iso: string | Date | null | undefined,
  now: Date = new Date(),
): number | null {
  const d = toDate(iso);
  if (!d) return null;
  return Math.round((d.getTime() - now.getTime()) / 60_000);
}

/** "in 40 min", "in 3 h", "25 min late" — how a cashier reads the clock. */
export function dueLabel(
  iso: string | Date | null | undefined,
  now: Date = new Date(),
): string | null {
  const mins = minutesUntil(iso, now);
  if (mins == null) return null;
  if (mins < 0) {
    const late = Math.abs(mins);
    return late < 60 ? `${late} min late` : `${Math.round(late / 60)} h late`;
  }
  if (mins < 60) return `in ${mins} min`;
  if (mins < 24 * 60) return `in ${Math.round(mins / 60)} h`;
  return `in ${Math.round(mins / (24 * 60))} days`;
}

function manilaDayKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: MANILA_TZ }); // YYYY-MM-DD
}

function toDate(iso: string | Date | null | undefined): Date | null {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
