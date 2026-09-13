import { describe, it, expect } from "vitest";
import {
  manilaDayKey,
  manilaStartOfDay,
  manilaEndOfDay,
  manilaStartOfDaysAgo,
  manilaDayRange,
} from "@/lib/time/manila";

describe("Manila day boundaries", () => {
  it("starts the day at 16:00 UTC the previous day (Manila midnight)", () => {
    // 10 Aug 2026, 02:00 Manila == 9 Aug 2026, 18:00 UTC
    const ref = new Date("2026-08-09T18:00:00.000Z");
    expect(manilaStartOfDay(ref).toISOString()).toBe("2026-08-09T16:00:00.000Z");
    expect(manilaDayKey(ref)).toBe("2026-08-10");
  });

  it("keeps an early-morning Manila order inside TODAY, not yesterday", () => {
    // The reported bug: a 01:00 Manila sale fell before UTC midnight and was
    // counted as the previous day.
    const order = new Date("2026-08-09T17:00:00.000Z"); // 10 Aug, 01:00 Manila
    const start = manilaStartOfDay(order);
    expect(order.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(order.getTime()).toBeLessThan(manilaEndOfDay(order).getTime());
  });

  it("puts a late-evening Manila order inside the same day", () => {
    const order = new Date("2026-08-10T15:30:00.000Z"); // 10 Aug, 23:30 Manila
    expect(manilaDayKey(order)).toBe("2026-08-10");
    expect(order.getTime()).toBeLessThan(manilaEndOfDay(order).getTime());
  });

  it("spans exactly 24 hours", () => {
    const ref = new Date("2026-08-10T05:00:00.000Z");
    expect(manilaEndOfDay(ref).getTime() - manilaStartOfDay(ref).getTime()).toBe(86_400_000);
  });

  it("counts back whole Manila days", () => {
    const ref = new Date("2026-08-10T05:00:00.000Z");
    const weekAgo = manilaStartOfDaysAgo(7, ref);
    expect(manilaDayKey(weekAgo)).toBe("2026-08-03");
    expect(manilaStartOfDay(ref).getTime() - weekAgo.getTime()).toBe(7 * 86_400_000);
  });

  it("resolves a day key back to its UTC window", () => {
    const { from, to } = manilaDayRange("2026-08-10");
    expect(from.toISOString()).toBe("2026-08-09T16:00:00.000Z");
    expect(to.toISOString()).toBe("2026-08-10T16:00:00.000Z");
    expect(manilaDayKey(from)).toBe("2026-08-10");
  });
});
