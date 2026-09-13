import { describe, it, expect } from "vitest";
import { dueBucket, dueLabel, minutesUntil } from "@/lib/orders/scheduled";

/**
 * How the till sorts its advance orders.
 *
 * The cashier's question all day is "what do I need to send to the kitchen
 * now". An order whose time has already gone is the one that costs a customer
 * their booking, so it sorts first — ahead of one due later today, ahead of
 * next Saturday's.
 */

// 16 Aug 2026, 2:00 PM Manila = 06:00 UTC.
const NOW = new Date("2026-08-16T06:00:00.000Z");
const manila = (iso: string) => new Date(iso);

describe("dueBucket", () => {
  it("puts a passed time first", () => {
    // 1:00 PM Manila, an hour ago.
    expect(dueBucket(manila("2026-08-16T05:00:00.000Z"), NOW)).toBe("overdue");
  });

  it("calls a later slot today, today", () => {
    // 6:30 PM Manila.
    expect(dueBucket(manila("2026-08-16T10:30:00.000Z"), NOW)).toBe("today");
  });

  it("leaves next week where it is", () => {
    expect(dueBucket(manila("2026-08-22T10:30:00.000Z"), NOW)).toBe("later");
  });

  // 4 PM UTC is already tomorrow in Manila. Bucketing on the UTC day would show
  // tomorrow morning's booking as due today, and the kitchen would cook it.
  it("counts the day in Manila, not UTC", () => {
    expect(dueBucket(manila("2026-08-16T17:00:00.000Z"), NOW)).toBe("later");
  });

  it("treats an unscheduled order as later, never as due", () => {
    expect(dueBucket(null, NOW)).toBe("later");
    expect(dueBucket("not a date", NOW)).toBe("later");
  });

  // The boundary: still to come by a minute is today, not overdue.
  it("flips to overdue only once the time has actually passed", () => {
    expect(dueBucket(new Date(NOW.getTime() + 60_000), NOW)).toBe("today");
    expect(dueBucket(new Date(NOW.getTime() - 60_000), NOW)).toBe("overdue");
  });
});

describe("the clock a cashier reads", () => {
  it("counts down in minutes, then hours, then days", () => {
    expect(dueLabel(new Date(NOW.getTime() + 40 * 60_000), NOW)).toBe("in 40 min");
    expect(dueLabel(new Date(NOW.getTime() + 3 * 3_600_000), NOW)).toBe("in 3 h");
    expect(dueLabel(new Date(NOW.getTime() + 2 * 86_400_000), NOW)).toBe("in 2 days");
  });

  it("says how late a missed one is", () => {
    expect(dueLabel(new Date(NOW.getTime() - 25 * 60_000), NOW)).toBe("25 min late");
    expect(dueLabel(new Date(NOW.getTime() - 2 * 3_600_000), NOW)).toBe("2 h late");
  });

  it("says nothing about an unscheduled order", () => {
    expect(dueLabel(null, NOW)).toBeNull();
    expect(minutesUntil(null, NOW)).toBeNull();
  });

  it("goes negative once the time has passed", () => {
    expect(minutesUntil(new Date(NOW.getTime() - 10 * 60_000), NOW)).toBe(-10);
  });
});

describe("the till's badge", () => {
  // Only what's still waiting AND due — a booking already with the kitchen is
  // not a thing the cashier needs to act on, and neither is next Saturday's.
  const due = (bucket: string, status: string) => status === "pending" && bucket !== "later";

  it("counts what's waiting and due", () => {
    expect(due("overdue", "pending")).toBe(true);
    expect(due("today", "pending")).toBe(true);
  });

  it("ignores what's already gone through", () => {
    expect(due("overdue", "new")).toBe(false);
    expect(due("today", "preparing")).toBe(false);
  });

  it("ignores what isn't due yet", () => {
    expect(due("later", "pending")).toBe(false);
  });
});
