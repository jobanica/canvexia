import { describe, it, expect } from "vitest";
import {
  manilaDayIso,
  isoDaysAgo,
  manilaDayBounds,
  parseRange,
  enumerateDays,
  presetRange,
} from "@/lib/pharmacy/range";

/**
 * WHICH DAY A PESO LANDS IN.
 *
 * A sale at 7am Manila is 11pm UTC the day before. A report that ranges on UTC
 * days therefore books the morning's takings into yesterday — silently, every
 * day, on every figure. These tests exist because that error is invisible in
 * the totals and only shows up as "the 1st looks wrong".
 */
describe("Manila days", () => {
  it("puts an early-morning Manila sale in the Manila day, not the UTC one", () => {
    // 2026-09-17T23:30:00Z is 2026-09-18 07:30 in Manila.
    expect(manilaDayIso(new Date("2026-09-17T23:30:00Z"))).toBe("2026-09-18");
  });

  it("puts a late-evening Manila sale in the same Manila day", () => {
    // 2026-09-17T15:30:00Z is 2026-09-17 23:30 in Manila — still the 17th.
    expect(manilaDayIso(new Date("2026-09-17T15:30:00Z"))).toBe("2026-09-17");
  });

  it("bounds a day half-open, so midnight belongs to exactly one day", () => {
    const { start, end } = manilaDayBounds("2026-09-17");
    expect(start.toISOString()).toBe("2026-09-16T16:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-17T16:00:00.000Z");
    // The next day's start is this day's end: no gap, no overlap.
    expect(manilaDayBounds("2026-09-18").start.getTime()).toBe(end.getTime());
  });

  it("counts back in Manila days", () => {
    const at = new Date("2026-09-17T15:00:00Z"); // 23:00 Manila on the 17th
    expect(isoDaysAgo(0, at)).toBe("2026-09-17");
    expect(isoDaysAgo(29, at)).toBe("2026-08-19");
  });
});

describe("reading a range off the URL", () => {
  const at = new Date("2026-09-17T04:00:00Z"); // noon Manila

  it("defaults to the last 30 days ending today", () => {
    const r = parseRange({}, at);
    expect(r.to).toBe("2026-09-17");
    expect(r.from).toBe("2026-08-19");
    expect(r.days).toBe(30);
  });

  it("falls back rather than throwing on a mistyped date", () => {
    // These arrive in a URL a user can edit. A 500 on the first screen after
    // signing in is not an acceptable answer to a typo.
    const r = parseRange({ from: "not-a-date", to: "2026-09-17" }, at);
    expect(r.from).toBe("2026-08-19");
    expect(r.to).toBe("2026-09-17");
  });

  it("swaps a reversed range instead of returning nothing", () => {
    const r = parseRange({ from: "2026-09-17", to: "2026-09-01" }, at);
    expect(r.from).toBe("2026-09-01");
    expect(r.to).toBe("2026-09-17");
  });

  it("includes the whole of the last day", () => {
    const r = parseRange({ from: "2026-09-17", to: "2026-09-17" }, at);
    expect(r.days).toBe(1);
    // A sale at 23:59 Manila on the 17th is inside the range.
    expect(new Date("2026-09-17T15:59:00Z").getTime()).toBeLessThan(r.end.getTime());
    // One at 00:00 Manila on the 18th is not.
    expect(new Date("2026-09-17T16:00:00Z").getTime()).toBe(r.end.getTime());
  });
});

describe("the chart's x-axis", () => {
  it("has one point per day with no holes", () => {
    const r = parseRange({ from: "2026-09-01", to: "2026-09-07" }, new Date("2026-09-17T04:00:00Z"));
    const days = enumerateDays(r);
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-09-01");
    expect(days[6]).toBe("2026-09-07");
  });

  it("refuses to draw a decade typed into the URL", () => {
    const r = parseRange({ from: "2016-01-01", to: "2026-01-01" }, new Date("2026-09-17T04:00:00Z"));
    expect(enumerateDays(r).length).toBeLessThanOrEqual(366);
  });

  it("presets are inclusive of both ends", () => {
    const at = new Date("2026-09-17T04:00:00Z");
    // "7d" means seven days of trading, not eight.
    const r = presetRange(7, at);
    expect(r.from).toBe("2026-09-11");
    expect(r.to).toBe("2026-09-17");
    expect(parseRange(r, at).days).toBe(7);
  });
});
