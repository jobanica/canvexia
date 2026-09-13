import { describe, it, expect } from "vitest";
import {
  ADDRESS_MIN,
  RESERVED_ADDRESSES,
  checkWebAddress,
  webAddressPreview,
} from "@/lib/restaurants/web-address";

/**
 * The address a shop was given at signup, from whatever it typed as its name.
 * Typos there are common and were permanent; this is the correction, and it has
 * to agree exactly with the slugify the platform minted the address with, or
 * the preview shown to the owner lies about what they'll get.
 */

describe("checkWebAddress", () => {
  it("accepts a clean address", () => {
    expect(checkWebAddress("mango-grill")).toEqual({ ok: true, slug: "mango-grill" });
  });

  it("turns what somebody actually types into the address they'll get", () => {
    // "Mango Grill" and "mango-grill" have to reach the same place — an owner
    // fixing a typo types the shop's name, not a slug.
    expect(checkWebAddress("Mango Grill")).toEqual({ ok: true, slug: "mango-grill" });
    expect(checkWebAddress("  Aling Nena's Carinderia  ")).toEqual({
      ok: true,
      slug: "aling-nena-s-carinderia",
    });
  });

  it("refuses an empty address", () => {
    expect(checkWebAddress("")).toMatchObject({ ok: false });
    expect(checkWebAddress("   ")).toMatchObject({ ok: false });
  });

  it("refuses one too short to be an address", () => {
    const res = checkWebAddress("ab");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain(String(ADDRESS_MIN));
  });

  it("refuses the platform's own addresses", () => {
    for (const reserved of ["admin", "api", "login", "order", "super-admin"]) {
      expect(RESERVED_ADDRESSES).toContain(reserved);
      expect(checkWebAddress(reserved).ok).toBe(false);
    }
  });

  it("refuses a reserved word however it was typed", () => {
    // "Admin" and "admin" are the same address once slugified.
    expect(checkWebAddress("Admin").ok).toBe(false);
  });

  it("says so rather than silently saving when nothing changed", () => {
    const res = checkWebAddress("mango-grill", "mango-grill");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("already");
  });

  it("allows an address that only differs from the current one by a typo fix", () => {
    expect(checkWebAddress("mango-grill", "mango-gril")).toEqual({ ok: true, slug: "mango-grill" });
  });

  it("does not treat a non-Latin name as a reserved word by accident", () => {
    // Slugify strips these to nothing and falls back; the point is it fails
    // with an explanation rather than saving something meaningless.
    expect(checkWebAddress("!!!").ok).toBe(false);
  });

  it("refuses a non-string", () => {
    expect(checkWebAddress(null).ok).toBe(false);
    expect(checkWebAddress(42).ok).toBe(false);
  });
});

describe("webAddressPreview", () => {
  it("shows the real links", () => {
    expect(webAddressPreview("https://www.servdph.com", "mango-grill")).toEqual({
      site: "https://www.servdph.com/r/mango-grill",
      table: "https://www.servdph.com/order/mango-grill/…",
    });
  });

  it("doesn't double the slash on a base URL with a trailing one", () => {
    expect(webAddressPreview("https://www.servdph.com/", "mango-grill").site).toBe(
      "https://www.servdph.com/r/mango-grill",
    );
  });
});
