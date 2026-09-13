import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Mango Grill")).toBe("mango-grill");
    expect(slugify("  Tito's  BBQ & Grill!! ")).toBe("tito-s-bbq-grill");
  });
  it("strips accents", () => {
    expect(slugify("Café Niño")).toBe("cafe-nino");
  });
  it("falls back for empty/symbol-only input", () => {
    expect(slugify("!!!")).toBe("restaurant");
    expect(slugify("")).toBe("restaurant");
  });
});

describe("uniqueSlug", () => {
  it("returns the base slug when free", async () => {
    const taken = new Set<string>();
    expect(await uniqueSlug("Mango Grill", async (s) => taken.has(s))).toBe("mango-grill");
  });
  it("appends a numeric suffix on collision", async () => {
    const taken = new Set(["mango-grill", "mango-grill-2"]);
    expect(await uniqueSlug("Mango Grill", async (s) => taken.has(s))).toBe("mango-grill-3");
  });
});
