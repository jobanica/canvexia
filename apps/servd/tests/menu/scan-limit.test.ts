import { describe, it, expect } from "vitest";
import { limitScanFiles, PARTNER_SCAN_LIMIT, ADMIN_SCAN_LIMIT } from "@/lib/menu/scan-limit";

/**
 * A menu scan costs one AI vision call per file, and a partner account has no
 * cap on how many storefronts it opens — so the spend is capped per scan.
 */

const f = (size = 1000) => ({ size });

describe("limitScanFiles", () => {
  it("lets a partner scan a single photo", () => {
    const r = limitScanFiles([f()], PARTNER_SCAN_LIMIT);
    expect(r.ok).toBe(true);
    expect(r.ok && r.files).toHaveLength(1);
  });

  it("refuses a second photo rather than silently dropping it", () => {
    // Trimming to one would return half a menu, read as "the AI missed things",
    // and the partner re-scans — spending more than the cap saved.
    const r = limitScanFiles([f(), f()], PARTNER_SCAN_LIMIT);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("One photo per scan");
  });

  it("still allows the super-admin four", () => {
    expect(limitScanFiles([f(), f(), f(), f()], ADMIN_SCAN_LIMIT).ok).toBe(true);
    const over = limitScanFiles([f(), f(), f(), f(), f()], ADMIN_SCAN_LIMIT);
    expect(over.ok).toBe(false);
    expect(over.ok === false && over.error).toContain("you picked 5");
  });

  it("ignores empty picks — an untouched file input posts a zero-byte entry", () => {
    const r = limitScanFiles([f(0), f(500)], PARTNER_SCAN_LIMIT);
    expect(r.ok).toBe(true);
    expect(r.ok && r.files).toHaveLength(1);
  });

  it("asks for a file when nothing usable was chosen", () => {
    expect(limitScanFiles([], PARTNER_SCAN_LIMIT).ok).toBe(false);
    const r = limitScanFiles([f(0)], PARTNER_SCAN_LIMIT);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("at least one");
  });

  it("counts only usable files against the cap", () => {
    // One real photo plus an empty slot is still one photo.
    expect(limitScanFiles([f(0), f(0), f(900)], PARTNER_SCAN_LIMIT).ok).toBe(true);
  });
});
