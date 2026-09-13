import { describe, it, expect } from "vitest";
import { countdownFor, prepCountdown, prepDeadline } from "@/lib/orders/prep-countdown";

/**
 * The merchant picks "20 minutes" when accepting. That was stored and shown as
 * a static "~20m", which says nothing once ten of those minutes have gone.
 *
 * The boundary that matters most here is the one where a duration ISN'T a
 * deadline: without a recorded moment of acceptance there is nothing to count
 * down from, and inventing one from the order's placed-at would show an advance
 * order booked this morning as hours late the second it was accepted.
 */

const ACCEPTED = "2026-08-25T10:00:00+08:00";
const at = (minutes: number) => Date.parse(ACCEPTED) + minutes * 60_000;

describe("prepDeadline", () => {
  it("is the promise added to the moment of acceptance", () => {
    expect(prepDeadline(ACCEPTED, 20)).toBe(at(20));
  });

  it("reads a Date the same as an ISO string", () => {
    expect(prepDeadline(new Date(ACCEPTED), 20)).toBe(prepDeadline(ACCEPTED, 20));
  });

  it("is null without a moment of acceptance", () => {
    // The whole reason acceptedAt had to be added. No guessing from createdAt.
    expect(prepDeadline(null, 20)).toBeNull();
    expect(prepDeadline(undefined, 20)).toBeNull();
  });

  it("is null without a promised time", () => {
    expect(prepDeadline(ACCEPTED, null)).toBeNull();
    expect(prepDeadline(ACCEPTED, 0)).toBeNull();
    expect(prepDeadline(ACCEPTED, -5)).toBeNull();
  });

  it("is null on an unreadable timestamp rather than NaN", () => {
    expect(prepDeadline("sometime", 20)).toBeNull();
  });
});

describe("prepCountdown", () => {
  const deadline = at(20);

  it("counts down in mm:ss", () => {
    expect(prepCountdown(deadline, at(0), 20).label).toBe("20:00");
    expect(prepCountdown(deadline, at(10), 20).label).toBe("10:00");
    expect(prepCountdown(deadline, at(19.5), 20).label).toBe("0:30");
  });

  it("pads the seconds so the number doesn't jump about", () => {
    expect(prepCountdown(deadline, at(19) + 53_000, 20).label).toBe("0:07");
  });

  it("keeps counting UP once the promise is blown", () => {
    // "How late am I" is the question at that point; a timer stuck on 0:00
    // stops answering it.
    const c = prepCountdown(deadline, at(22), 20);
    expect(c.overdue).toBe(true);
    expect(c.label).toBe("+2:00");
    expect(c.tone).toBe("late");
  });

  it("goes amber on the last quarter of the promise", () => {
    expect(prepCountdown(deadline, at(14), 20).tone).toBe("fresh");
    expect(prepCountdown(deadline, at(15), 20).tone).toBe("soon"); // 5 of 20 left
  });

  it("warns at least a minute out, however short the promise", () => {
    // A quarter of a 2-minute promise is 30 seconds — too late to be a warning,
    // so the floor of one minute takes over.
    const short = at(2);
    expect(prepCountdown(short, at(0.5), 2).tone).toBe("fresh"); // 90s left
    expect(prepCountdown(short, at(1), 2).tone).toBe("soon"); //    60s left
    expect(prepCountdown(short, at(1.5), 2).tone).toBe("soon"); //  30s left
  });

  it("is not overdue at exactly the deadline", () => {
    const c = prepCountdown(deadline, deadline, 20);
    expect(c.overdue).toBe(false);
    expect(c.label).toBe("0:00");
  });
});

describe("countdownFor", () => {
  it("gives nothing to show when the order can't be counted down", () => {
    expect(countdownFor(null, 20, at(5))).toBeNull();
    expect(countdownFor(ACCEPTED, null, at(5))).toBeNull();
  });

  it("gives the live figure when it can", () => {
    expect(countdownFor(ACCEPTED, 20, at(5))?.label).toBe("15:00");
  });
});
