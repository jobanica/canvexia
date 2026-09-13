import { describe, it, expect } from "vitest";
import {
  MAX_SHIFT_HOURS,
  isShiftCurrent,
  shiftExpiresAt,
  staleShiftCutoff,
} from "@/lib/orders/shift-window";

/**
 * The bug this exists for, in the owner's words: "Nawala po sa shift ng night
 * cashier ko ung sales from 6-12am." A shift that ended at midnight because the
 * calendar said so took six hours of takings with it, every single night.
 */

const at = (iso: string) => new Date(iso);
const hours = (n: number) => n * 60 * 60 * 1000;

describe("isShiftCurrent", () => {
  // Manila is UTC+8; 6 PM Manila is 10:00Z the day before.
  const opened = at("2026-08-12T10:00:00Z"); // 6 PM Manila, Aug 12

  it("survives midnight — the whole reason this module exists", () => {
    expect(isShiftCurrent(opened, at("2026-08-12T15:59:00Z"))).toBe(true); // 11:59 PM
    expect(isShiftCurrent(opened, at("2026-08-12T16:01:00Z"))).toBe(true); // 12:01 AM
  });

  it("is still the same shift at the end of a normal night", () => {
    expect(isShiftCurrent(opened, at("2026-08-12T18:00:00Z"))).toBe(true); // 2 AM, 8h in
  });

  it("holds through a long double shift", () => {
    expect(isShiftCurrent(opened, new Date(opened.getTime() + hours(15)))).toBe(true);
  });

  // The problem the midnight rule was there to solve: someone who never signs
  // out must not have tomorrow's takings land in today's drawer.
  it("lapses once nobody could still be working it", () => {
    expect(isShiftCurrent(opened, new Date(opened.getTime() + hours(MAX_SHIFT_HOURS + 1)))).toBe(false);
  });

  it("lapses before the same cashier's next day starts", () => {
    expect(isShiftCurrent(opened, new Date(opened.getTime() + hours(24)))).toBe(false);
  });

  // Inclusive at the cap, matching staleShiftCutoff exactly — see the note on
  // isShiftCurrent for why the two must agree to the millisecond.
  it("holds at the cap and lapses one millisecond past it", () => {
    expect(isShiftCurrent(opened, new Date(opened.getTime() + hours(MAX_SHIFT_HOURS)))).toBe(true);
    expect(isShiftCurrent(opened, new Date(opened.getTime() + hours(MAX_SHIFT_HOURS) + 1))).toBe(false);
  });
});

describe("shiftExpiresAt / staleShiftCutoff", () => {
  it("expires exactly one cap after opening", () => {
    const opened = at("2026-08-12T10:00:00Z");
    expect(shiftExpiresAt(opened).getTime() - opened.getTime()).toBe(hours(MAX_SHIFT_HOURS));
  });

  it("sweeps up anything opened before the cutoff, and nothing after", () => {
    const now = at("2026-08-13T02:00:00Z");
    const cutoff = staleShiftCutoff(now);
    const abandoned = new Date(now.getTime() - hours(MAX_SHIFT_HOURS + 2));
    const working = new Date(now.getTime() - hours(3));
    expect(abandoned < cutoff).toBe(true);
    expect(working < cutoff).toBe(false);
  });

  it("agrees with isShiftCurrent about the same shift", () => {
    const now = at("2026-08-13T02:00:00Z");
    const cutoff = staleShiftCutoff(now);
    for (const h of [0, 1, 8, 15, 16, 20, 30]) {
      const opened = new Date(now.getTime() - hours(h));
      expect(opened >= cutoff).toBe(isShiftCurrent(opened, now));
    }
  });

  it("caps long enough for a real shift and short enough to catch a forgotten one", () => {
    expect(MAX_SHIFT_HOURS).toBeGreaterThanOrEqual(12);
    expect(MAX_SHIFT_HOURS).toBeLessThan(24);
  });
});
