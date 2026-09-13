import { describe, it, expect } from "vitest";
import {
  waitingClock,
  waitingLabel,
  waitTone,
  waitingFrom,
  waitedMinutes,
} from "@/lib/orders/waiting";

/**
 * "How long has this been waiting?" — the question a cashier gets asked during
 * a rush, and the one the till couldn't answer.
 */

const NOW = Date.parse("2026-08-19T12:00:00+08:00");
const agoMins = (m: number) => new Date(NOW - m * 60_000).toISOString();

describe("waitingClock (kitchen)", () => {
  it("counts mm:ss", () => {
    expect(waitingClock(new Date(NOW - 90_000).toISOString(), NOW)).toBe("01:30");
  });

  it("grows an hours field rather than showing 75 minutes", () => {
    expect(waitingClock(agoMins(75), NOW)).toBe("1:15:00");
  });

  it("never runs backwards on a clock that's slightly ahead", () => {
    expect(waitingClock(new Date(NOW + 5_000).toISOString(), NOW)).toBe("00:00");
  });
});

describe("waitingLabel (till)", () => {
  it("says something a cashier can say out loud", () => {
    expect(waitingLabel(agoMins(0.4), NOW)).toBe("just now");
    expect(waitingLabel(agoMins(7), NOW)).toBe("7m");
    expect(waitingLabel(agoMins(65), NOW)).toBe("1h 5m");
    expect(waitingLabel(agoMins(120), NOW)).toBe("2h");
  });

  it("rounds down, so it never overstates the wait to a customer", () => {
    expect(waitingLabel(agoMins(9.9), NOW)).toBe("9m");
  });
});

describe("waitTone", () => {
  it("goes fresh → warn → late", () => {
    expect(waitTone(agoMins(2), NOW)).toBe("fresh");
    expect(waitTone(agoMins(10), NOW)).toBe("warn");
    expect(waitTone(agoMins(19), NOW)).toBe("warn");
    expect(waitTone(agoMins(20), NOW)).toBe("late");
    expect(waitTone(agoMins(90), NOW)).toBe("late");
  });
});

describe("waitingFrom — advance orders", () => {
  it("shows nothing for an order that isn't due yet", () => {
    // Placed three days ago FOR tomorrow. Counting from when it was placed
    // would report days of waiting and paint the card red for nothing.
    const placed = agoMins(3 * 24 * 60);
    const tomorrow = new Date(NOW + 24 * 60 * 60_000).toISOString();
    expect(waitingFrom(placed, tomorrow, NOW)).toBeNull();
  });

  it("counts from when it was DUE once that time passes", () => {
    const placed = agoMins(3 * 24 * 60);
    const due = agoMins(10);
    expect(waitingFrom(placed, due, NOW)).toBe(due);
    // Ten minutes late for a 7pm order is ten minutes, not three days.
    expect(waitingLabel(waitingFrom(placed, due, NOW)!, NOW)).toBe("10m");
  });

  it("counts from placement for an ordinary order", () => {
    const placed = agoMins(5);
    expect(waitingFrom(placed, null, NOW)).toBe(placed);
    expect(waitingFrom(placed, undefined, NOW)).toBe(placed);
  });

  it("falls back to placement if the scheduled time is unreadable", () => {
    const placed = agoMins(5);
    expect(waitingFrom(placed, "not a date", NOW)).toBe(placed);
  });
});

describe("waitedMinutes", () => {
  it("is the shared basis for both readings", () => {
    expect(waitedMinutes(agoMins(30), NOW)).toBeCloseTo(30, 5);
    expect(waitedMinutes(new Date(NOW + 60_000).toISOString(), NOW)).toBe(0);
  });
});
