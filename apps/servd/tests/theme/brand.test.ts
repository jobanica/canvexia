import { describe, it, expect } from "vitest";
import { brandStyle, SERVD_DEFAULTS } from "@/lib/theme/brand";

// Pure unit tests — no database needed. Verify white-label fallback behavior.
describe("brandStyle", () => {
  it("falls back to Servd defaults when a restaurant hasn't customized", () => {
    const style = brandStyle({}) as Record<string, string>;
    expect(style["--brand-primary"]).toBe(SERVD_DEFAULTS.primary);
    expect(style["--brand-accent"]).toBe(SERVD_DEFAULTS.accent);
  });

  it("uses the restaurant's own colors when set", () => {
    const style = brandStyle({
      brandPrimaryColor: "#123456",
      brandAccentColor: "#abcdef",
    }) as Record<string, string>;
    expect(style["--brand-primary"]).toBe("#123456");
    expect(style["--brand-accent"]).toBe("#abcdef");
    expect(style["--brand-gradient"]).toContain("#123456");
    expect(style["--brand-gradient"]).toContain("#abcdef");
  });
});
