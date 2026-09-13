import { manilaStartOfDay } from "@/lib/time/manila";

/**
 * The two acquisition tracks and when each step lands.
 *
 * Pure and framework-free: this is the part that decides what hits someone's
 * inbox and when, so it's kept testable and free of database or provider code.
 *
 * SCOPE: these emails go to UN-ACTIVATED LEADS ONLY. Once someone pays, the
 * relationship moves in-app (trial countdown, order caps, lifecycle) and this
 * system goes silent for them permanently. Email is acquisition; in-app is
 * lifecycle. They never mix.
 */

export type Track = "A" | "B";

/**
 * How a step's send time is derived.
 *
 *  • `offset` — a number of hours from the moment they entered the track. The
 *    clock time is whatever it happens to be, so these are the ones that can
 *    land in the middle of service and get shifted (see QUIET_HOURS).
 *  • `at` — a deliberate Manila wall-clock slot on day N. Authored on purpose,
 *    so it is honoured as written.
 */
export type StepTiming =
  | { type: "offset"; hours: number }
  | { type: "at"; days: number; hour: number; minute: number };

export interface StepDef {
  key: string;
  track: Track;
  timing: StepTiming;
  /** What this step is for — shown in super-admin next to the copy. */
  goal: string;
}

/**
 * Track A — gave us an email, hasn't finished a preview.
 * The ask is "come back and finish", never "pay". Asking for money before
 * they've seen their own restaurant is the wrong question at the wrong time.
 */
export const TRACK_A: StepDef[] = [
  { key: "A_immediate", track: "A", timing: { type: "offset", hours: 0 }, goal: "Get them back to finish building" },
  { key: "A_2h", track: "A", timing: { type: "offset", hours: 2 }, goal: "Quick nudge to return" },
  { key: "A_day1", track: "A", timing: { type: "at", days: 1, hour: 10, minute: 0 }, goal: "Benefit + example" },
  { key: "A_day3", track: "A", timing: { type: "at", days: 3, hour: 14, minute: 0 }, goal: "Address the friction" },
  { key: "A_day7", track: "A", timing: { type: "at", days: 7, hour: 10, minute: 0 }, goal: "Last nudge to finish" },
];

/**
 * Track B — built a preview, hasn't paid. Now the ask is activation.
 */
export const TRACK_B: StepDef[] = [
  { key: "B_immediate", track: "B", timing: { type: "offset", hours: 0 }, goal: "Your restaurant is ready" },
  { key: "B_day1", track: "B", timing: { type: "at", days: 1, hour: 10, minute: 0 }, goal: "Benefit + example" },
  { key: "B_day3", track: "B", timing: { type: "at", days: 3, hour: 14, minute: 0 }, goal: "Pain / urgency" },
  { key: "B_day5", track: "B", timing: { type: "at", days: 5, hour: 10, minute: 0 }, goal: "Social proof / trust" },
  { key: "B_day7", track: "B", timing: { type: "at", days: 7, hour: 18, minute: 30 }, goal: "Simple activation CTA" },
  { key: "B_day14", track: "B", timing: { type: "at", days: 14, hour: 10, minute: 0 }, goal: "Last re-engagement" },
];

export const ALL_STEPS: StepDef[] = [...TRACK_A, ...TRACK_B];

export function stepsFor(track: Track): StepDef[] {
  return track === "A" ? TRACK_A : TRACK_B;
}

export function stepDef(key: string): StepDef | undefined {
  return ALL_STEPS.find((s) => s.key === key);
}

/**
 * Manila windows a drifting send must not land in — the lunch and dinner
 * rushes. A restaurant owner reading marketing mail mid-service is a restaurant
 * owner deleting marketing mail.
 *
 * Applied to `offset` steps only. The `at` slots are deliberate choices by
 * whoever designed the sequence, including the 18:30 one, which is why it's
 * written to be short.
 */
export const QUIET_HOURS: { fromMin: number; toMin: number }[] = [
  { fromMin: 11 * 60 + 30, toMin: 13 * 60 + 30 }, // lunch service
  { fromMin: 17 * 60 + 30, toMin: 20 * 60 }, // dinner service
];

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Minutes past Manila midnight for a UTC instant. */
export function manilaMinuteOfDay(at: Date): number {
  const ms = at.getTime() + MANILA_OFFSET_MS;
  return Math.floor((ms % 86_400_000) / 60_000);
}

/**
 * Push a send out of a service rush to the moment the rush ends. Never pulls a
 * send earlier — being late is fine, being early is a promise broken.
 */
export function avoidRush(at: Date): Date {
  let out = at;
  // Loop because the shifted time could, in principle, land in the next window.
  for (let guard = 0; guard < 4; guard++) {
    const minute = manilaMinuteOfDay(out);
    const window = QUIET_HOURS.find((w) => minute >= w.fromMin && minute < w.toMin);
    if (!window) return out;
    out = new Date(out.getTime() + (window.toMin - minute) * 60_000);
  }
  return out;
}

/** The UTC instant of a Manila wall-clock time on the Nth day after `anchor`. */
export function manilaSlot(anchor: Date, days: number, hour: number, minute: number): Date {
  const midnight = manilaStartOfDay(anchor).getTime();
  return new Date(midnight + days * 86_400_000 + hour * 3_600_000 + minute * 60_000);
}

/** "Right away" / "+2 hours" / "Day 3 · 2:00 PM" — for the super-admin list. */
export function timingLabel(timing: StepTiming): string {
  if (timing.type === "offset") {
    if (timing.hours === 0) return "Right away";
    return `+${timing.hours} ${timing.hours === 1 ? "hour" : "hours"}`;
  }
  const suffix = timing.hour < 12 ? "AM" : "PM";
  const h12 = timing.hour % 12 === 0 ? 12 : timing.hour % 12;
  const mm = String(timing.minute).padStart(2, "0");
  return `Day ${timing.days} · ${h12}:${mm} ${suffix}`;
}

export interface ScheduledStep {
  stepKey: string;
  track: Track;
  sendAt: Date;
}

/**
 * When every step of a track should land for someone entering it at `anchor`.
 *
 * A fixed slot that has already passed for today (say they reach preview at
 * 4 PM and day 0's slot was 10 AM) is simply in the past — the runner treats
 * anything due as due, so it goes out on the next pass rather than being
 * silently dropped.
 */
export function computeSchedule(track: Track, anchor: Date): ScheduledStep[] {
  return stepsFor(track).map((step) => {
    const sendAt =
      step.timing.type === "offset"
        ? avoidRush(new Date(anchor.getTime() + step.timing.hours * 3_600_000))
        : manilaSlot(anchor, step.timing.days, step.timing.hour, step.timing.minute);
    return { stepKey: step.key, track, sendAt };
  });
}
