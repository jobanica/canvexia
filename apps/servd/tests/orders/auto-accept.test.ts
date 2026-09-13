import { describe, it, expect } from "vitest";
import {
  AUTO_ACCEPT_DEFAULT_SECONDS,
  AUTO_ACCEPT_MAX_SECONDS,
  AUTO_ACCEPT_MIN_SECONDS,
  autoAcceptCutoff,
  autoAcceptEnabled,
  autoAcceptLabel,
  isDueForAutoAccept,
  normalizeAutoAcceptSeconds,
  secondsUntilAutoAccept,
} from "@/lib/orders/auto-accept";

/**
 * Auto-accept sends food to the kitchen without a person agreeing to it, so
 * every ambiguous input has to resolve to OFF rather than to a default wait.
 * That is what most of this file is checking.
 */

const NOW = new Date("2026-08-22T12:00:00+08:00");
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000);

describe("normalizeAutoAcceptSeconds", () => {
  it("keeps a sensible wait as it is", () => {
    expect(normalizeAutoAcceptSeconds(10)).toBe(10);
    expect(normalizeAutoAcceptSeconds(60)).toBe(60);
  });

  it("reads every kind of nothing as OFF, never as a default", () => {
    for (const v of [null, undefined, 0, -1, "", "  ", "soon", NaN, {}]) {
      expect(normalizeAutoAcceptSeconds(v)).toBeNull();
    }
  });

  it("accepts a numeric string, because a form field is a string", () => {
    expect(normalizeAutoAcceptSeconds("30")).toBe(30);
  });

  it("clamps a wait too short for anyone to answer", () => {
    expect(normalizeAutoAcceptSeconds(1)).toBe(AUTO_ACCEPT_MIN_SECONDS);
  });

  it("clamps an absurd wait", () => {
    expect(normalizeAutoAcceptSeconds(99_999)).toBe(AUTO_ACCEPT_MAX_SECONDS);
  });

  it("rounds a fractional wait", () => {
    expect(normalizeAutoAcceptSeconds(10.6)).toBe(11);
  });
});

describe("autoAcceptEnabled", () => {
  it("is off until somebody sets a wait", () => {
    expect(autoAcceptEnabled(null)).toBe(false);
    expect(autoAcceptEnabled(0)).toBe(false);
    expect(autoAcceptEnabled(AUTO_ACCEPT_DEFAULT_SECONDS)).toBe(true);
  });
});

describe("autoAcceptCutoff", () => {
  it("is null when off — not 'now'", () => {
    // A cutoff of now would sweep up every pending order in the shop, which is
    // the worst thing this code could do. Off has to mean "no cutoff exists".
    expect(autoAcceptCutoff(null, NOW)).toBeNull();
    expect(autoAcceptCutoff(0, NOW)).toBeNull();
  });

  it("is the wait, subtracted from now", () => {
    expect(autoAcceptCutoff(10, NOW)!.toISOString()).toBe(ago(10).toISOString());
  });
});

describe("isDueForAutoAccept", () => {
  it("takes an order that has waited longer than the setting", () => {
    expect(isDueForAutoAccept(ago(11), 10, NOW)).toBe(true);
  });

  it("leaves an order that is still inside its window", () => {
    expect(isDueForAutoAccept(ago(9), 10, NOW)).toBe(false);
  });

  it("takes one that has waited exactly the setting", () => {
    expect(isDueForAutoAccept(ago(10), 10, NOW)).toBe(true);
  });

  it("never takes anything while the feature is off", () => {
    // Even an order from an hour ago: off is off.
    expect(isDueForAutoAccept(ago(3600), null, NOW)).toBe(false);
    expect(isDueForAutoAccept(ago(3600), 0, NOW)).toBe(false);
  });

  it("reads an ISO string the same as a Date", () => {
    expect(isDueForAutoAccept(ago(11).toISOString(), 10, NOW)).toBe(true);
  });

  it("refuses an unreadable timestamp rather than guessing", () => {
    expect(isDueForAutoAccept("whenever", 10, NOW)).toBe(false);
  });
});

describe("secondsUntilAutoAccept", () => {
  it("counts down", () => {
    expect(secondsUntilAutoAccept(ago(4), 10, NOW)).toBe(6);
  });

  it("floors at zero for an order already due", () => {
    expect(secondsUntilAutoAccept(ago(30), 10, NOW)).toBe(0);
  });

  it("is null when off", () => {
    expect(secondsUntilAutoAccept(ago(4), null, NOW)).toBeNull();
  });
});

describe("autoAcceptLabel", () => {
  it("says off when off", () => {
    expect(autoAcceptLabel(null)).toBe("off");
  });

  it("reads in seconds under a minute, minutes above", () => {
    expect(autoAcceptLabel(10)).toBe("10 seconds");
    expect(autoAcceptLabel(60)).toBe("1 minute");
    expect(autoAcceptLabel(120)).toBe("2 minutes");
  });
});
