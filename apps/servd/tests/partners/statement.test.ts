import { describe, it, expect } from "vitest";
import { monthBounds, monthKeyOf, previousMonth, recentMonths } from "@servd/db";

/**
 * The month arithmetic behind every statement.
 *
 * Pure, and the part most likely to be quietly wrong: Asia/Manila is UTC+8, so
 * computing a month boundary in UTC puts eight hours of 31 December into
 * January's statement — money attributed to the wrong month, in a document
 * somebody is paid against.
 */
describe("monthKeyOf — Asia/Manila", () => {
  it("puts 31 December 23:00 Manila in December, not January", () => {
    // 2026-12-31 23:00 +08:00 === 2026-12-31 15:00Z
    expect(monthKeyOf(new Date("2026-12-31T15:00:00Z"))).toBe("2026-12");
  });

  it("puts 1 January 00:30 Manila in January", () => {
    // 2027-01-01 00:30 +08:00 === 2026-12-31 16:30Z
    expect(monthKeyOf(new Date("2026-12-31T16:30:00Z"))).toBe("2027-01");
  });

  it("does not shift a mid-month instant", () => {
    expect(monthKeyOf(new Date("2026-06-15T09:00:00Z"))).toBe("2026-06");
  });
});

describe("monthBounds", () => {
  it("starts at Manila midnight on the 1st, expressed in UTC", () => {
    const { start } = monthBounds("2026-06");
    // 2026-06-01 00:00 +08:00 === 2026-05-31 16:00Z
    expect(start.toISOString()).toBe("2026-05-31T16:00:00.000Z");
  });

  it("ends at the next month's Manila midnight, exclusive", () => {
    const { end } = monthBounds("2026-06");
    expect(end.toISOString()).toBe("2026-06-30T16:00:00.000Z");
  });

  it("rolls the year over in December", () => {
    const { start, end } = monthBounds("2026-12");
    expect(start.toISOString()).toBe("2026-11-30T16:00:00.000Z");
    expect(end.toISOString()).toBe("2026-12-31T16:00:00.000Z");
  });

  it("leaves no gap and no overlap between consecutive months", () => {
    // The property that actually matters: every settled payment lands in
    // exactly one statement. A gap loses money; an overlap pays it twice.
    for (const [a, b] of [
      ["2026-01", "2026-02"],
      ["2026-02", "2026-03"], // February, including the short-month case
      ["2026-11", "2026-12"],
      ["2026-12", "2027-01"],
    ]) {
      expect(monthBounds(a).end.getTime(), `${a}→${b}`).toBe(monthBounds(b).start.getTime());
    }
  });

  it("covers a leap day", () => {
    const { start, end } = monthBounds("2028-02");
    const days = (end.getTime() - start.getTime()) / 864e5;
    expect(days).toBe(29);
  });
});

describe("recentMonths", () => {
  it("returns N months oldest first, ending with the current one", () => {
    expect(recentMonths(new Date("2026-06-15T09:00:00Z"), 6)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
  });

  it("walks back across a year boundary", () => {
    expect(recentMonths(new Date("2027-02-10T09:00:00Z"), 4)).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });
});

describe("previousMonth", () => {
  it("is the month before, with no time zone in the arithmetic", () => {
    expect(previousMonth("2026-06")).toBe("2026-05");
    expect(previousMonth("2026-03")).toBe("2026-02");
  });

  it("rolls January back to the previous December", () => {
    expect(previousMonth("2027-01")).toBe("2026-12");
  });

  it("is what the freeze job uses instead of 'now minus a day'", () => {
    // The bug this replaced: the job ran at 16:00 UTC on the 1st, which is the
    // 2nd in Manila, so "yesterday" was the 1st — and monthKeyOf(the 1st) is
    // the month that had just STARTED. It would have frozen an empty month and
    // never closed the real one.
    const firesAt = new Date("2026-07-01T01:00:00Z"); // 09:00 Manila on the 1st
    expect(monthKeyOf(firesAt)).toBe("2026-07");
    expect(previousMonth(monthKeyOf(firesAt))).toBe("2026-06");

    const wrongSchedule = new Date("2026-07-01T16:00:00Z"); // 00:00 Manila, 2nd
    const yesterday = new Date(wrongSchedule.getTime() - 864e5);
    expect(monthKeyOf(yesterday)).toBe("2026-07"); // the month that just began
  });
});
