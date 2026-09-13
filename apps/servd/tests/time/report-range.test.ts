import { describe, it, expect } from "vitest";
import { parseReportRange, rangeLabel, isDayKey } from "@/lib/time/report-range";
import { manilaDayKey } from "@/lib/time/manila";

/**
 * Manila is UTC+8 and the server runs in UTC, so every boundary here is a
 * chance to lose the hours between midnight and 8 AM. These pin the edges at
 * the times that actually break: just after Manila midnight, and across a
 * month and a year boundary.
 */

// 13 Aug 2026, 00:30 Manila = 12 Aug 2026, 16:30 UTC.
const NOW = new Date("2026-08-12T16:30:00Z");

const key = (d: Date) => manilaDayKey(d);

describe("parseReportRange presets", () => {
  it("today starts at Manila midnight, not UTC midnight", () => {
    const r = parseReportRange({ range: "today" }, NOW);
    expect(r.preset).toBe("today");
    // Manila midnight of Aug 13 is 16:00Z on Aug 12.
    expect(r.from.toISOString()).toBe("2026-08-12T16:00:00.000Z");
    expect(key(r.from)).toBe("2026-08-13");
    expect(r.to).toEqual(NOW);
  });

  // The bug this guards: at 00:30 Manila, a UTC-based "today" would start at
  // 08:00 Manila and report nothing at all.
  it("includes an order taken half an hour after Manila midnight", () => {
    const r = parseReportRange({ range: "today" }, NOW);
    const order = new Date("2026-08-12T16:20:00Z"); // 00:20 Manila, Aug 13
    expect(order >= r.from && order <= r.to).toBe(true);
  });

  it("yesterday is one whole Manila day, and stops before today", () => {
    const r = parseReportRange({ range: "yesterday" }, NOW);
    expect(r.fromKey).toBe("2026-08-12");
    expect(r.toKey).toBe("2026-08-12");
    expect(r.to.getTime() - r.from.getTime()).toBe(86_400_000);
  });

  it("7 days means today and the six before it, not eight days", () => {
    const r = parseReportRange({ range: "7" }, NOW);
    expect(r.fromKey).toBe("2026-08-07");
    expect(r.toKey).toBe("2026-08-13");
  });

  it("30 and 90 count the same way", () => {
    expect(parseReportRange({ range: "30" }, NOW).fromKey).toBe("2026-07-15");
    expect(parseReportRange({ range: "90" }, NOW).fromKey).toBe("2026-05-16");
  });

  it("this month starts on the 1st in Manila", () => {
    const r = parseReportRange({ range: "this_month" }, NOW);
    expect(r.fromKey).toBe("2026-08-01");
    expect(r.toKey).toBe("2026-08-13");
  });

  it("last month is the whole month, ending where this one starts", () => {
    const r = parseReportRange({ range: "last_month" }, NOW);
    expect(r.fromKey).toBe("2026-07-01");
    expect(r.toKey).toBe("2026-07-31");
  });

  it("rolls the year back for last month in January", () => {
    const jan = new Date("2026-01-10T04:00:00Z"); // noon Manila, 10 Jan
    const r = parseReportRange({ range: "last_month" }, jan);
    expect(r.fromKey).toBe("2025-12-01");
    expect(r.toKey).toBe("2025-12-31");
  });

  it("falls back to 30 days for junk, rather than erroring", () => {
    for (const range of [undefined, "", "banana", "-1", "999"]) {
      expect(parseReportRange({ range }, NOW).preset).toBe("30");
    }
  });
});

describe("custom ranges", () => {
  it("covers both end days in full", () => {
    const r = parseReportRange({ from: "2026-08-01", to: "2026-08-05" }, NOW);
    expect(r.preset).toBe("custom");
    expect(r.from.toISOString()).toBe("2026-07-31T16:00:00.000Z"); // Manila Aug 1, 00:00
    expect(r.to.toISOString()).toBe("2026-08-05T16:00:00.000Z"); // end of Manila Aug 5
  });

  it("works for a single day", () => {
    const r = parseReportRange({ from: "2026-08-09", to: "2026-08-09" }, NOW);
    expect(r.to.getTime() - r.from.getTime()).toBe(86_400_000);
    expect(r.label).toBe("Aug 9, 2026");
  });

  // Picking the end date before the start is a slip, not something to punish
  // with an empty report.
  it("swaps reversed dates instead of returning nothing", () => {
    const r = parseReportRange({ from: "2026-08-20", to: "2026-08-01" }, NOW);
    expect(r.fromKey).toBe("2026-08-01");
    expect(r.toKey).toBe("2026-08-20");
  });

  it("beats the preset when both dates are present", () => {
    const r = parseReportRange({ range: "today", from: "2026-01-01", to: "2026-01-31" }, NOW);
    expect(r.preset).toBe("custom");
  });

  it("ignores a half-filled custom range", () => {
    expect(parseReportRange({ range: "7", from: "2026-08-01" }, NOW).preset).toBe("7");
    expect(parseReportRange({ range: "7", to: "2026-08-01" }, NOW).preset).toBe("7");
  });

  it("ignores dates that aren't dates", () => {
    expect(parseReportRange({ from: "yesterday", to: "today" }, NOW).preset).toBe("30");
    expect(parseReportRange({ from: "2026-13-45", to: "2026-13-46" }, NOW).preset).toBe("30");
  });
});

describe("isDayKey", () => {
  it("accepts a real day key and rejects everything else", () => {
    expect(isDayKey("2026-08-13")).toBe(true);
    expect(isDayKey("2026-8-13")).toBe(false);
    expect(isDayKey("13/08/2026")).toBe(false);
    expect(isDayKey(undefined)).toBe(false);
  });
});

describe("rangeLabel", () => {
  it("says one day plainly", () => {
    expect(rangeLabel("2026-08-13", "2026-08-13")).toBe("Aug 13, 2026");
  });

  it("drops the repeated year inside one year", () => {
    expect(rangeLabel("2026-08-01", "2026-08-13")).toBe("Aug 1 – Aug 13, 2026");
  });

  it("keeps both years when the span crosses one", () => {
    expect(rangeLabel("2025-12-28", "2026-01-04")).toBe("Dec 28, 2025 – Jan 4, 2026");
  });
});
