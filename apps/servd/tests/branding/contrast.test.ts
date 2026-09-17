import { describe, it, expect } from "vitest";
import { contrast, darkenToContrast, readableOn } from "@servd/core";

describe("darkenToContrast", () => {
  it("leaves a colour that already reads on white alone", () => {
    // CANVEXIA's own primary, which is what the portal falls back to.
    const out = darkenToContrast("#e8536a");
    expect(out).toBeTruthy();
    expect(contrast(out!, "#FFFFFF")!.passesAA).toBe(true);
  });

  it("darkens one that does not, until it does", () => {
    // A pale yellow — the exact case the file was written for.
    const out = darkenToContrast("#FFE14D")!;
    expect(contrast("#FFE14D", "#FFFFFF")!.passesAA).toBe(false);
    expect(contrast(out, "#FFFFFF")!.passesAA).toBe(true);
  });

  it("keeps the hue rather than blending to grey", () => {
    // Scaling the channels preserves their ratios, so a yellow stays a yellow:
    // red and green stay high, blue stays the lowest of the three.
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(darkenToContrast("#FFE14D")!.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(b);
  });

  it("does not overshoot into near-black", () => {
    // The lightest passing shade, not the safest one. A partner's yellow should
    // still look like their yellow.
    const out = darkenToContrast("#FFE14D")!;
    const ratio = contrast(out, "#FFFFFF")!.ratio;
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(ratio).toBeLessThan(5.5);
  });

  it("honours a lower bar when asked for one", () => {
    const aa = darkenToContrast("#FFE14D", 4.5)!;
    const large = darkenToContrast("#FFE14D", 3)!;
    // A 3:1 target keeps more of the original lightness than a 4.5:1 one.
    expect(contrast(large, "#FFFFFF")!.ratio).toBeLessThan(contrast(aa, "#FFFFFF")!.ratio);
  });

  it("returns null for anything that is not a hex", () => {
    // So a caller falls back to its own default rather than writing a broken
    // CSS variable.
    for (const bad of ["", "rebeccapurple", "rgb(1,2,3)", "#12", "#gggggg"]) {
      expect(darkenToContrast(bad), bad).toBeNull();
    }
  });

  it("accepts the three-digit form", () => {
    expect(darkenToContrast("#fe4")).toBeTruthy();
  });

  it("white cannot read on white, so it comes back nearly black", () => {
    // Degenerate but reachable: somebody picks #FFFFFF as their brand colour.
    // The answer has to be readable, not white.
    const out = darkenToContrast("#FFFFFF")!;
    expect(contrast(out, "#FFFFFF")!.passesAA).toBe(true);
    expect(readableOn(out)).toBe("#FFFFFF");
  });
});
