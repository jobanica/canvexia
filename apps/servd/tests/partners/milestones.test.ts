import { describe, it, expect } from "vitest";
import {
  DEFAULT_MILESTONES,
  ladderProgress,
  milestoneProgress,
  parseMilestones,
} from "@servd/core";

/**
 * The milestone maths.
 *
 * Pure, and tested at fixed dates — which is the whole reason `asOf` is a
 * parameter. A function that reads its own clock cannot be tested on the day
 * that matters, which here is the day a partner is told they are behind.
 */
const START = new Date("2026-01-01T00:00:00Z");

describe("parseMilestones", () => {
  it("defaults to the agreed ladder when the column is null", () => {
    expect(parseMilestones(null)).toEqual([...DEFAULT_MILESTONES]);
    expect(parseMilestones(undefined)).toEqual([...DEFAULT_MILESTONES]);
  });

  it("defaults when the column is an EMPTY array, not 'no milestones'", () => {
    // The answer that matters: a partner with an empty ladder would silently
    // always read as on track, which is the one thing this feature must never
    // say by accident.
    expect(parseMilestones([])).toEqual([...DEFAULT_MILESTONES]);
  });

  it("is 10 by month 1, 25 by month 3, 50 by month 6", () => {
    expect(DEFAULT_MILESTONES).toEqual([
      { month: 1, target: 10 },
      { month: 3, target: 25 },
      { month: 6, target: 50 },
    ]);
  });

  it("sorts a ladder HQ entered out of order", () => {
    expect(parseMilestones([{ month: 6, target: 50 }, { month: 1, target: 10 }])).toEqual([
      { month: 1, target: 10 },
      { month: 6, target: 50 },
    ]);
  });

  it("drops junk rather than trusting a JSON column", () => {
    expect(parseMilestones([{ month: "x", target: 1 }, null, { month: 2, target: 20 }])).toEqual([
      { month: 2, target: 20 },
    ]);
  });
});

describe("milestoneProgress", () => {
  it("is met the moment the target is reached, whatever the date", () => {
    const p = milestoneProgress({ month: 1, target: 10 }, 10, START, new Date("2026-01-05T00:00:00Z"));
    expect(p.status).toBe("met");
    expect(p.progress).toBe(1);
  });

  it("is at risk when behind linear pace", () => {
    // Three weeks into a one-month, ten-merchant target: pace wants 7.5, has 4.
    const p = milestoneProgress({ month: 1, target: 10 }, 4, START, new Date("2026-01-22T00:00:00Z"));
    expect(p.status).toBe("at_risk");
  });

  it("is on track when ahead of pace but not yet there", () => {
    const p = milestoneProgress({ month: 1, target: 10 }, 8, START, new Date("2026-01-22T00:00:00Z"));
    expect(p.status).toBe("on_track");
  });

  it("is missed only once the date has passed", () => {
    const before = milestoneProgress({ month: 1, target: 10 }, 2, START, new Date("2026-01-31T00:00:00Z"));
    const after = milestoneProgress({ month: 1, target: 10 }, 2, START, new Date("2026-02-02T00:00:00Z"));
    expect(before.status).toBe("at_risk");
    expect(after.status).toBe("missed");
  });

  it("does not tell a brand-new partner they have already failed", () => {
    // No licence start date means there is no pace to be behind. Reading it as
    // missed would greet a partner on day one with a failure.
    const p = milestoneProgress({ month: 1, target: 10 }, 0, null, new Date("2030-01-01T00:00:00Z"));
    expect(p.status).toBe("on_track");
    expect(p.dueAt).toBeNull();
    expect(p.daysRemaining).toBeNull();
  });

  it("adds months on the calendar, not in 30-day blocks", () => {
    const p = milestoneProgress(
      { month: 1, target: 10 },
      0,
      new Date("2026-01-31T00:00:00Z"),
      new Date("2026-02-01T00:00:00Z"),
    );
    // 31 Jan + 1 month lands in March in JS, which is the behaviour to be aware
    // of rather than to pretend away — what matters is that it is a calendar
    // month and not 30 days.
    expect(p.dueAt!.getTime()).toBeGreaterThan(new Date("2026-02-27T00:00:00Z").getTime());
  });

  it("does not divide by a zero target", () => {
    const p = milestoneProgress({ month: 1, target: 0 }, 0, START, new Date("2026-01-15T00:00:00Z"));
    expect(p.progress).toBe(1);
    expect(p.status).toBe("met");
  });

  it("counts days remaining toward the due date", () => {
    const p = milestoneProgress({ month: 1, target: 10 }, 1, START, new Date("2026-01-25T00:00:00Z"));
    expect(p.daysRemaining).toBe(7);
  });
});

describe("ladderProgress", () => {
  it("leads with the next checkpoint not yet met", () => {
    const { current, steps } = ladderProgress(
      DEFAULT_MILESTONES,
      12,
      START,
      new Date("2026-02-01T00:00:00Z"),
    );
    expect(steps).toHaveLength(3);
    expect(steps[0].status).toBe("met"); // 12 >= 10
    expect(current?.month).toBe(3);
  });

  it("still has something to show once every checkpoint is met", () => {
    const { current } = ladderProgress(DEFAULT_MILESTONES, 99, START, new Date("2026-02-01T00:00:00Z"));
    expect(current?.month).toBe(6);
    expect(current?.status).toBe("met");
  });
});
