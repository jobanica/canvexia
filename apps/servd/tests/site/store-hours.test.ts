import { describe, it, expect } from "vitest";
import {
  describeWindow,
  isOpenAt,
  openAt,
  parseHm,
  wrapsMidnight,
  type DayWindow,
} from "@/lib/site/store-hours";

const win = (open: string, close: string): DayWindow => ({ open, close, closed: false });
const SHUT: DayWindow = { open: "00:00", close: "00:00", closed: true };

/** index 0 = Sunday … 6 = Saturday */
const SUN = 0, MON = 1, TUE = 2, SAT = 6;

/**
 * The reported schedule, exactly as the owner set it:
 *   Mon–Sat  10:00 – 02:30 (next day)
 *   Sun      17:00 – 01:30 (next day)
 *
 * At 2 AM on a Sunday the shop went dark. It shouldn't have: that moment
 * belongs to SATURDAY's session, which runs until 02:30. The old rule only ever
 * read the current day's row, found Sunday's 17:00–01:30, and shut the doors
 * half an hour early — with the only workaround being to write Sunday's close
 * as 02:30, which fixes the symptom by lying about Sunday.
 */
const REPORTED: DayWindow[] = [
  win("17:00", "01:30"), // Sun
  win("10:00", "02:30"), // Mon
  win("10:00", "02:30"), // Tue
  win("10:00", "02:30"), // Wed
  win("10:00", "02:30"), // Thu
  win("10:00", "02:30"), // Fri
  win("10:00", "02:30"), // Sat
];

const at = (day: number, hhmm: string) => openAt(REPORTED, day, parseHm(hhmm)!);

describe("the reported schedule", () => {
  // The exact moment that was wrong.
  it("is open at 2 AM Sunday — Saturday's session runs to 02:30", () => {
    expect(at(SUN, "02:00")).toBe(true);
  });

  it("shuts at Saturday's closing time, not a minute later", () => {
    expect(at(SUN, "02:29")).toBe(true);
    expect(at(SUN, "02:30")).toBe(false);
    expect(at(SUN, "03:00")).toBe(false);
  });

  it("stays shut all Sunday morning and afternoon", () => {
    expect(at(SUN, "09:00")).toBe(false);
    expect(at(SUN, "16:59")).toBe(false);
  });

  it("opens Sunday evening", () => {
    expect(at(SUN, "17:00")).toBe(true);
    expect(at(SUN, "23:59")).toBe(true);
  });

  // Sunday closes at 01:30, so Monday 2 AM really is shut — Monday's own
  // session doesn't start until 10:00. The fix must not paper over that.
  it("is shut at 2 AM Monday, because Sunday ended at 01:30", () => {
    expect(at(MON, "01:29")).toBe(true);
    expect(at(MON, "01:30")).toBe(false);
    expect(at(MON, "02:00")).toBe(false);
  });

  it("opens Monday morning at ten", () => {
    expect(at(MON, "09:59")).toBe(false);
    expect(at(MON, "10:00")).toBe(true);
  });

  it("runs a weekday session right through midnight", () => {
    expect(at(MON, "23:59")).toBe(true);
    expect(at(TUE, "00:01")).toBe(true);
    expect(at(TUE, "02:29")).toBe(true);
  });

  it("is open at 2 AM Saturday, from Friday's session", () => {
    expect(at(SAT, "02:00")).toBe(true);
  });
});

describe("plain daytime hours", () => {
  const nine2nine = Array.from({ length: 7 }, () => win("09:00", "21:00"));

  it("opens and closes on the same day", () => {
    expect(openAt(nine2nine, MON, parseHm("08:59")!)).toBe(false);
    expect(openAt(nine2nine, MON, parseHm("09:00")!)).toBe(true);
    expect(openAt(nine2nine, MON, parseHm("20:59")!)).toBe(true);
    expect(openAt(nine2nine, MON, parseHm("21:00")!)).toBe(false);
  });

  it("leaves nothing running past midnight", () => {
    expect(openAt(nine2nine, MON, parseHm("00:30")!)).toBe(false);
  });
});

describe("a closed day", () => {
  const shutMonday = [...REPORTED];
  shutMonday[MON] = SHUT;

  it("is shut on its own day", () => {
    expect(openAt(shutMonday, MON, parseHm("12:00")!)).toBe(false);
  });

  // Closing Monday must not also close Tuesday's early hours, which belong to
  // Monday's session — there isn't one, so Tuesday 2 AM is shut.
  it("leaves no tail for the next morning", () => {
    expect(openAt(shutMonday, TUE, parseHm("02:00")!)).toBe(false);
    expect(openAt(shutMonday, TUE, parseHm("12:00")!)).toBe(true);
  });

  it("doesn't stop the previous day's tail reaching it", () => {
    // Sunday 17:00–01:30 still spills into a closed Monday's small hours.
    expect(openAt(shutMonday, MON, parseHm("01:00")!)).toBe(true);
  });
});

describe("edges", () => {
  it("treats equal open and close as round the clock", () => {
    const always = Array.from({ length: 7 }, () => win("00:00", "00:00"));
    expect(openAt(always, MON, parseHm("03:00")!)).toBe(true);
    expect(openAt(always, MON, parseHm("15:00")!)).toBe(true);
  });

  // Wrongly shut is a complaint; wrongly open is orders nobody is there to cook.
  it("treats an unreadable time as closed, not as always open", () => {
    const broken = Array.from({ length: 7 }, () => win("", "banana"));
    expect(openAt(broken, MON, parseHm("12:00")!)).toBe(false);
  });

  it("rejects impossible clock times", () => {
    expect(parseHm("25:00")).toBeNull();
    expect(parseHm("10:70")).toBeNull();
    expect(parseHm("9:30")).toBe(570);
    expect(parseHm(null)).toBeNull();
  });

  it("knows which days run past midnight", () => {
    expect(wrapsMidnight(win("10:00", "02:30"))).toBe(true);
    expect(wrapsMidnight(win("09:00", "21:00"))).toBe(false);
    expect(wrapsMidnight(SHUT)).toBe(false);
  });

  it("wraps the week around rather than falling off it", () => {
    // Sunday's "yesterday" is Saturday, at the other end of the array.
    expect(at(SUN, "02:00")).toBe(true);
  });
});

describe("in Manila time", () => {
  // The server runs in UTC; every shop here is UTC+8.
  it("reads 02:00 Manila Sunday as open, not 02:00 UTC", () => {
    // 2026-08-16 is a Sunday. 02:00 Manila = 18:00 UTC on Saturday the 15th.
    expect(isOpenAt(REPORTED, new Date("2026-08-15T18:00:00.000Z"))).toBe(true);
  });

  it("reads 03:00 Manila Sunday as shut", () => {
    expect(isOpenAt(REPORTED, new Date("2026-08-15T19:00:00.000Z"))).toBe(false);
  });

  it("reads Sunday lunchtime as shut", () => {
    // 12:00 Manila Sunday = 04:00 UTC Sunday.
    expect(isOpenAt(REPORTED, new Date("2026-08-16T04:00:00.000Z"))).toBe(false);
  });
});

describe("describeWindow", () => {
  it("spells out the day it actually shuts", () => {
    expect(describeWindow(win("10:00", "02:30"))).toBe("10:00 – 02:30 (next day)");
  });

  it("leaves an ordinary day alone", () => {
    expect(describeWindow(win("09:00", "21:00"))).toBe("09:00 – 21:00");
  });

  it("says so when a day is shut or round the clock", () => {
    expect(describeWindow(SHUT)).toBe("Closed");
    expect(describeWindow(win("00:00", "00:00"))).toBe("Open 24 hours");
  });
});
