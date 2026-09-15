import { describe, it, expect } from "vitest";
import { contrast, readableOn } from "@servd/core";

/**
 * The brand editor's contrast check.
 *
 * A partner will eventually pick a pale yellow for a button with white text on
 * it, and the first person to notice will be one of their merchants, on a
 * phone, in sunlight.
 */
describe("contrast", () => {
  it("is 21 for black on white and 1 for a colour on itself", () => {
    expect(contrast("#000000", "#FFFFFF")!.ratio).toBe(21);
    expect(contrast("#E8536A", "#E8536A")!.ratio).toBe(1);
  });

  it("is symmetric", () => {
    expect(contrast("#1A1A1E", "#FAFAF8")!.ratio).toBe(contrast("#FAFAF8", "#1A1A1E")!.ratio);
  });

  it("fails white text on a pale yellow", () => {
    const r = contrast("#FFE066", "#FFFFFF")!;
    expect(r.passesAA).toBe(false);
    expect(r.passesAALarge).toBe(false);
  });

  it("passes white text on CANVEXIA's ink", () => {
    expect(contrast("#1A1A1E", "#FFFFFF")!.passesAA).toBe(true);
  });

  it("ROUNDS DOWN, so a failing pair is never labelled passing", () => {
    // 4.4999 rounding to "4.5 ✓" would be a failing button with a tick on it.
    const r = contrast("#767676", "#FFFFFF")!;
    expect(r.ratio).toBeLessThanOrEqual(4.54);
    expect(Number.isInteger(r.ratio * 100)).toBe(true);
  });

  it("accepts three-digit hex and a missing #", () => {
    expect(contrast("#fff", "000")!.ratio).toBe(21);
  });

  it("returns null rather than a number for something that is not a colour", () => {
    expect(contrast("rebeccapurple", "#FFFFFF")).toBeNull();
    expect(contrast("", "#FFFFFF")).toBeNull();
    expect(contrast("#12345", "#FFFFFF")).toBeNull();
  });
});

describe("readableOn", () => {
  it("puts white on dark and ink on light", () => {
    expect(readableOn("#1A1A1E")).toBe("#FFFFFF");
    expect(readableOn("#FFE066")).toBe("#1A1A1E");
  });

  it("falls back to ink for an unparseable colour rather than throwing", () => {
    expect(readableOn("not a colour")).toBe("#1A1A1E");
  });
});
