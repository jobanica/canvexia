import { describe, it, expect } from "vitest";
import { isScriptStatus, cleanMetric, buildRemixTopic } from "@/lib/content/stats";

describe("isScriptStatus", () => {
  it("accepts valid statuses", () => {
    expect(isScriptStatus("IDEA")).toBe(true);
    expect(isScriptStatus("POSTED")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isScriptStatus("posted")).toBe(false);
    expect(isScriptStatus("NOPE")).toBe(false);
    expect(isScriptStatus(3)).toBe(false);
    expect(isScriptStatus(null)).toBe(false);
  });
});

describe("cleanMetric", () => {
  it("treats blank/null/undefined as null", () => {
    expect(cleanMetric("")).toBeNull();
    expect(cleanMetric(null)).toBeNull();
    expect(cleanMetric(undefined)).toBeNull();
  });
  it("rounds to a non-negative integer", () => {
    expect(cleanMetric("12")).toBe(12);
    expect(cleanMetric(12.7)).toBe(13);
  });
  it("rejects negatives and non-numbers", () => {
    expect(cleanMetric(-5)).toBeNull();
    expect(cleanMetric("abc")).toBeNull();
  });
});

describe("buildRemixTopic", () => {
  it("references the original title and the variation number", () => {
    const t = buildRemixTopic("30% lang ang sa app", 2);
    expect(t).toContain("30% lang ang sa app");
    expect(t).toContain("variation 2");
  });
});
