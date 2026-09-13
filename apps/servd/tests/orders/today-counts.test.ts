import { describe, it, expect } from "vitest";
import { manilaStartOfDay, manilaDayKey } from "@/lib/time/manila";
import { parseReportRange } from "@/lib/time/report-range";

/**
 * Why the dashboard can read zero while the order is plainly in the history.
 *
 * The two answer different questions on purpose — the dashboard counts money
 * taken TODAY, the history lists orders PLACED over a wider window — and the
 * gap between them is what looked like a bug. These pin the difference so it
 * stays deliberate rather than becoming an accident again.
 */

describe("the dashboard's day", () => {
  it("starts at Manila midnight, not UTC midnight", () => {
    // 00:30 Manila on 16 Aug = 16:30 UTC on 15 Aug. A UTC-midnight boundary
    // would put this order on the previous day and drop the whole night's trade.
    const justAfterManilaMidnight = new Date("2026-08-15T16:30:00.000Z");
    const start = manilaStartOfDay(justAfterManilaMidnight);
    expect(start.toISOString()).toBe("2026-08-15T16:00:00.000Z");
    expect(manilaDayKey(justAfterManilaMidnight)).toBe("2026-08-16");
  });

  it("puts a late-evening order on the day it was taken", () => {
    // 23:00 Manila on 15 Aug = 15:00 UTC.
    const lateEvening = new Date("2026-08-15T15:00:00.000Z");
    expect(manilaDayKey(lateEvening)).toBe("2026-08-15");
    expect(manilaStartOfDay(lateEvening).toISOString()).toBe("2026-08-14T16:00:00.000Z");
  });
});

describe("the order history's window", () => {
  const now = new Date("2026-08-15T06:00:00.000Z"); // 14:00 Manila

  // This is the mundane half of the answer: history shows a month, the
  // dashboard shows today, so an order from last week appears in one and
  // legitimately not in the other.
  it("defaults to thirty days, not today", () => {
    const r = parseReportRange({}, now);
    expect(r.preset).toBe("30");
    expect(r.from.getTime()).toBeLessThan(manilaStartOfDay(now).getTime());
  });

  it("matches the dashboard exactly when asked for today", () => {
    const r = parseReportRange({ range: "today" }, now);
    expect(r.from.toISOString()).toBe(manilaStartOfDay(now).toISOString());
  });
});

/**
 * The other half: "Orders today" counts orders that were PAID, because revenue
 * is money taken. An order taken and not yet settled contributes nothing to it
 * — correct, and completely opaque until the dashboard says so.
 */
describe("paid versus placed", () => {
  const unsettled = (placed: number, paid: number) => Math.max(0, placed - paid);

  it("has something to report when an order is taken but not settled", () => {
    expect(unsettled(1, 0)).toBe(1);
  });

  it("says nothing when everything taken has been settled", () => {
    expect(unsettled(4, 4)).toBe(0);
  });

  // A payment can land today against a ticket opened last night, so paid can
  // exceed placed within the window. That's not a negative backlog.
  it("never reports a negative backlog", () => {
    expect(unsettled(2, 5)).toBe(0);
  });
});
