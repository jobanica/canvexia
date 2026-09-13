import { describe, it, expect } from "vitest";
import {
  TRACK_A,
  TRACK_B,
  ALL_STEPS,
  avoidRush,
  manilaSlot,
  manilaMinuteOfDay,
  computeSchedule,
  stepDef,
  timingLabel,
} from "@/lib/email/tracks";
import { DEFAULT_COPY } from "@/lib/email/default-copy";

/** A Manila wall-clock time, as the UTC instant the server actually holds. */
function manila(iso: string): Date {
  return new Date(`${iso}+08:00`);
}

describe("manilaMinuteOfDay", () => {
  it("reads the Manila clock, not the server's UTC one", () => {
    // 09:00 Manila is 01:00 UTC — formatting this without a timezone is the
    // exact bug this helper exists to prevent.
    expect(manilaMinuteOfDay(manila("2026-03-04T09:00:00"))).toBe(9 * 60);
    expect(manilaMinuteOfDay(manila("2026-03-04T00:15:00"))).toBe(15);
    expect(manilaMinuteOfDay(manila("2026-03-04T23:59:00"))).toBe(23 * 60 + 59);
  });
});

describe("avoidRush", () => {
  it("leaves a quiet-time send exactly where it is", () => {
    const at = manila("2026-03-04T09:30:00");
    expect(avoidRush(at).getTime()).toBe(at.getTime());
  });

  it("pushes a lunch-service send to the end of the rush", () => {
    expect(avoidRush(manila("2026-03-04T12:00:00")).toISOString()).toBe(
      manila("2026-03-04T13:30:00").toISOString(),
    );
  });

  it("pushes a dinner-service send to the end of the rush", () => {
    expect(avoidRush(manila("2026-03-04T19:45:00")).toISOString()).toBe(
      manila("2026-03-04T20:00:00").toISOString(),
    );
  });

  // Being late is a shrug; being early breaks the "+2 hours" promise and can
  // land a step before the one that's meant to precede it.
  it("never moves a send earlier", () => {
    for (let h = 0; h < 24; h++) {
      const at = manila(`2026-03-04T${String(h).padStart(2, "0")}:20:00`);
      expect(avoidRush(at).getTime()).toBeGreaterThanOrEqual(at.getTime());
    }
  });

  it("treats the closing minute of a window as already clear", () => {
    const at = manila("2026-03-04T13:30:00");
    expect(avoidRush(at).getTime()).toBe(at.getTime());
  });
});

describe("manilaSlot", () => {
  it("lands on the Manila wall-clock time of the Nth day after the anchor", () => {
    // Anchored late at night Manila — the day boundary has to be Manila's, not
    // UTC's, or "day 1" silently becomes the same calendar day.
    const anchor = manila("2026-03-04T23:40:00");
    expect(manilaSlot(anchor, 1, 10, 0).toISOString()).toBe(
      manila("2026-03-05T10:00:00").toISOString(),
    );
  });

  it("handles an anchor in the small hours of Manila morning", () => {
    const anchor = manila("2026-03-04T00:30:00");
    expect(manilaSlot(anchor, 3, 14, 0).toISOString()).toBe(
      manila("2026-03-07T14:00:00").toISOString(),
    );
  });
});

describe("computeSchedule", () => {
  const anchor = manila("2026-03-04T09:00:00");

  it("writes one row per step of the track, and only that track", () => {
    const a = computeSchedule("A", anchor);
    expect(a.map((s) => s.stepKey)).toEqual(TRACK_A.map((s) => s.key));
    expect(a.every((s) => s.track === "A")).toBe(true);

    const b = computeSchedule("B", anchor);
    expect(b.map((s) => s.stepKey)).toEqual(TRACK_B.map((s) => s.key));
  });

  it("sends the immediate step at the anchor itself", () => {
    const [first] = computeSchedule("A", anchor);
    expect(first.sendAt.getTime()).toBe(anchor.getTime());
  });

  it("shifts an offset step out of the lunch rush", () => {
    // 10:30 + 2h = 12:30, mid-service → pushed to 13:30.
    const plan = computeSchedule("A", manila("2026-03-04T10:30:00"));
    const twoHour = plan.find((s) => s.stepKey === "A_2h")!;
    expect(twoHour.sendAt.toISOString()).toBe(manila("2026-03-04T13:30:00").toISOString());
  });

  // The 18:30 slot is inside the dinner window on purpose: a fixed slot is a
  // deliberate authored choice, whereas an offset lands wherever it lands.
  it("honours a fixed slot even inside a rush window", () => {
    const plan = computeSchedule("B", anchor);
    const day7 = plan.find((s) => s.stepKey === "B_day7")!;
    expect(day7.sendAt.toISOString()).toBe(manila("2026-03-11T18:30:00").toISOString());
  });

  it("keeps every step in ascending order", () => {
    for (const track of ["A", "B"] as const) {
      const times = computeSchedule(track, anchor).map((s) => s.sendAt.getTime());
      expect([...times].sort((x, y) => x - y)).toEqual(times);
    }
  });

  // Reaching a preview at 4 PM means day 0's 10 AM slot is already gone. It
  // must come out in the past (and so send on the next pass), not be dropped.
  it("puts an already-passed slot in the past rather than skipping it", () => {
    const late = manila("2026-03-04T16:00:00");
    const plan = computeSchedule("B", late);
    expect(plan.every((s) => s.sendAt.getTime() >= late.getTime() - 86_400_000)).toBe(true);
    expect(plan.find((s) => s.stepKey === "B_immediate")!.sendAt.getTime()).toBe(late.getTime());
  });
});

describe("the sequence itself", () => {
  it("has copy for every step", () => {
    for (const s of ALL_STEPS) {
      expect(DEFAULT_COPY[s.key], `missing copy for ${s.key}`).toBeTruthy();
    }
  });

  // The unique (restaurant, step) index is the no-double-send guarantee; a
  // duplicate key here would quietly collapse two steps into one.
  it("has no duplicate step keys across the two tracks", () => {
    const keys = ALL_STEPS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("resolves every key back to its definition", () => {
    for (const s of ALL_STEPS) expect(stepDef(s.key)).toBe(s);
    expect(stepDef("nope")).toBeUndefined();
  });

  // Track A must never ask for money — they haven't seen their restaurant yet.
  it("keeps the activate button out of Track A", () => {
    for (const s of TRACK_A) {
      expect(DEFAULT_COPY[s.key].body).not.toContain("{{activate_button}}");
    }
  });

  it("gives every Track B step a way to pay", () => {
    for (const s of TRACK_B) {
      expect(DEFAULT_COPY[s.key].body).toContain("{{activate_button}}");
    }
  });
});

describe("timingLabel", () => {
  it("reads as a human would say it", () => {
    expect(timingLabel({ type: "offset", hours: 0 })).toBe("Right away");
    expect(timingLabel({ type: "offset", hours: 1 })).toBe("+1 hour");
    expect(timingLabel({ type: "offset", hours: 2 })).toBe("+2 hours");
    expect(timingLabel({ type: "at", days: 3, hour: 14, minute: 0 })).toBe("Day 3 · 2:00 PM");
    expect(timingLabel({ type: "at", days: 7, hour: 18, minute: 30 })).toBe("Day 7 · 6:30 PM");
    expect(timingLabel({ type: "at", days: 1, hour: 10, minute: 0 })).toBe("Day 1 · 10:00 AM");
  });
});
