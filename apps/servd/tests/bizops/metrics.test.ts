import { describe, it, expect } from "vitest";
import {
  capBand,
  capPercent,
  daysBetween,
  fmtPeso,
  fmtRate,
  isUpsellBand,
  perUnit,
  rate,
} from "@/lib/bizops/metrics";

/**
 * The brief's own rule: "a confident wrong number is worse than a blank."
 *
 * Almost everything here is about the denominator. A week with no ad spend and
 * no leads is not 0% conversion at ₱0 per lead — it is no answer, and printing
 * one puts a red figure on a dashboard the founder then acts on.
 */

describe("rate", () => {
  it("is the percentage when there's something to divide by", () => {
    expect(rate(3, 12)).toBe(25);
  });

  it("is null when nothing came in, not 0%", () => {
    expect(rate(0, 0)).toBeNull();
    expect(rate(5, 0)).toBeNull();
  });

  it("is null on a nonsense denominator rather than Infinity", () => {
    expect(rate(1, -4)).toBeNull();
    expect(rate(1, NaN)).toBeNull();
  });
});

describe("perUnit", () => {
  it("divides the spend across the leads", () => {
    expect(perUnit(10_000, 20)).toBe(500);
  });

  it("is null with no leads — spend ÷ 0 is not a cost per lead", () => {
    expect(perUnit(10_000, 0)).toBeNull();
  });

  it("reports zero spend honestly as ₱0, not as a blank", () => {
    // Nothing spent IS an answer; nothing acquired is not.
    expect(perUnit(0, 20)).toBe(0);
  });
});

describe("daysBetween", () => {
  it("counts whole days", () => {
    expect(daysBetween("2026-08-01T00:00:00Z", "2026-08-04T05:00:00Z")).toBe(3);
  });

  it("never goes negative on a future date", () => {
    expect(daysBetween("2026-09-01T00:00:00Z", "2026-08-01T00:00:00Z")).toBe(0);
  });

  it("survives an unreadable date", () => {
    expect(daysBetween("whenever", "2026-08-04T00:00:00Z")).toBe(0);
  });
});

describe("capBand", () => {
  it("walks the thresholds from the brief", () => {
    expect(capBand(50, 100)).toBe("ok");
    expect(capBand(70, 100)).toBe("opportunity");
    expect(capBand(80, 100)).toBe("notify");
    expect(capBand(90, 100)).toBe("prompt");
    expect(capBand(100, 100)).toBe("capped");
    expect(capBand(140, 100)).toBe("capped");
  });

  it("calls an uncapped plan unlimited rather than 0%", () => {
    // Dividing by Infinity prints "0%", which reads as "barely using it" for
    // exactly the shops that outgrew a cap long ago.
    expect(capBand(4000, null)).toBe("unlimited");
    expect(capBand(4000, Infinity)).toBe("unlimited");
    expect(capPercent(4000, null)).toBeNull();
    expect(capPercent(4000, Infinity)).toBeNull();
  });

  it("marks the bands that need somebody to act", () => {
    expect(isUpsellBand("ok")).toBe(false);
    expect(isUpsellBand("unlimited")).toBe(false);
    expect(isUpsellBand("opportunity")).toBe(true);
    expect(isUpsellBand("capped")).toBe(true);
  });
});

describe("formatting", () => {
  it("prints an em dash for a figure with no answer", () => {
    expect(fmtRate(null)).toBe("—");
    expect(fmtPeso(null)).toBe("—");
  });

  it("prints pesos from centavos", () => {
    expect(fmtPeso(49_900)).toBe("₱499");
    expect(fmtPeso(1_234_500)).toBe("₱12,345");
  });

  it("prints a real zero as zero", () => {
    // Zero revenue is a fact worth showing; it's the missing denominator that
    // has to blank out.
    expect(fmtPeso(0)).toBe("₱0");
    expect(fmtRate(0)).toBe("0%");
  });
});
