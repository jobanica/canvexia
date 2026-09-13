/**
 * How long an order has been waiting, and how worried to look about it.
 *
 * The kitchen display has had this since the start. The till hadn't, which is
 * the wrong way round during a rush: the cashier is the one being asked "how
 * much longer?", and they were answering from memory.
 *
 * Two readings of the same number, because the two screens are read
 * differently. The kitchen wants a running clock it can glance at from across
 * the room; the cashier wants a word they can say out loud to a customer.
 *
 * Pure — the caller passes `nowMs` from a single ticking clock, so every card
 * on a board agrees and there's one timer rather than one per card.
 */

/** Minutes at which a wait stops being normal, then becomes late. */
export const WAIT_WARN_MINS = 10;
export const WAIT_LATE_MINS = 20;

export type WaitTone = "fresh" | "warn" | "late";

export function waitedMinutes(iso: string, nowMs: number): number {
  const ms = nowMs - new Date(iso).getTime();
  return Math.max(0, ms / 60000);
}

/** Running clock: mm:ss, or h:mm:ss once past the hour. For the kitchen. */
export function waitingClock(iso: string, nowMs: number): string {
  const secs = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const sec = secs % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/**
 * Spoken form: "just now", "7m", "1h 5m". For the till.
 *
 * No seconds. A cashier reading this is about to say a number to somebody
 * standing in front of them, and "3m" is the answer — "03:24" is a stopwatch.
 */
export function waitingLabel(iso: string, nowMs: number): string {
  const mins = Math.floor(waitedMinutes(iso, nowMs));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function waitTone(iso: string, nowMs: number): WaitTone {
  const mins = waitedMinutes(iso, nowMs);
  if (mins >= WAIT_LATE_MINS) return "late";
  if (mins >= WAIT_WARN_MINS) return "warn";
  return "fresh";
}

/**
 * Should a waiting time be shown at all?
 *
 * No, for an advance order that isn't due yet. It was placed on purpose days
 * ahead, so counting from when it was placed reports "2880m waiting" and paints
 * the card red for something nobody is waiting on. Once its time arrives the
 * wait is real again, and it's measured from then — being ten minutes late for
 * a 7pm order is ten minutes late, not three days.
 */
export function waitingFrom(
  createdAt: string,
  scheduledFor: string | null | undefined,
  nowMs: number,
): string | null {
  if (!scheduledFor) return createdAt;
  const due = new Date(scheduledFor).getTime();
  if (Number.isNaN(due)) return createdAt;
  if (due > nowMs) return null; // not due yet — nobody is waiting
  return scheduledFor;
}
