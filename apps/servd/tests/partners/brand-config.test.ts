import { describe, it, expect } from "vitest";
import {
  EMPTY_BRAND_CONFIG,
  parseBrandConfig,
  resolveBrand,
  validateBrandConfig,
} from "@servd/core";

/**
 * brandConfig is a JSON column, so nothing checks it at the database boundary.
 * These are that boundary.
 */
describe("partner brand config", () => {
  describe("parseBrandConfig — reading whatever is in the column", () => {
    it("keeps the fields it knows", () => {
      expect(parseBrandConfig({ displayName: "CebuEats", primaryColor: "#112233" })).toEqual({
        displayName: "CebuEats",
        primaryColor: "#112233",
      });
    });

    it("drops unknown keys instead of passing them through", () => {
      expect(parseBrandConfig({ displayName: "A", evil: "<script>", nested: { x: 1 } })).toEqual({
        displayName: "A",
      });
    });

    it("ignores values of the wrong type rather than rendering them", () => {
      expect(parseBrandConfig({ displayName: 42, logoUrl: null, accentColor: [] })).toEqual({});
    });

    it("treats blank and whitespace-only as unset, and trims the rest", () => {
      expect(parseBrandConfig({ displayName: "   ", legalName: "  Ltd  " })).toEqual({
        legalName: "Ltd",
      });
    });

    it("survives anything at all — a bad brand must not take a storefront down", () => {
      for (const junk of [null, undefined, "", 0, [], "a string", true]) {
        expect(parseBrandConfig(junk)).toEqual(EMPTY_BRAND_CONFIG);
      }
    });
  });

  describe("validateBrandConfig — refusing it on the way in", () => {
    it("accepts a complete, well-formed brand", () => {
      const r = validateBrandConfig({
        displayName: "CebuEats",
        primaryColor: "#FF8A1E",
        accentColor: "#FF4D6D",
        logoUrl: "https://cdn.example.com/logo.png",
        supportEmail: "help@cebueats.ph",
      });
      expect(r.ok).toBe(true);
    });

    it("rejects a colour that is not a six-digit hex", () => {
      for (const bad of ["FF8A1E", "#FFF", "orange", "#GGGGGG"]) {
        const r = validateBrandConfig({ primaryColor: bad });
        expect(r.ok).toBe(false);
      }
    });

    it("rejects http asset URLs — they are mixed content on a merchant's page", () => {
      const r = validateBrandConfig({ logoUrl: "http://cdn.example.com/logo.png" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors[0]).toMatch(/https/);
    });

    it("rejects a javascript: URL", () => {
      expect(validateBrandConfig({ supportUrl: "javascript:alert(1)" }).ok).toBe(false);
    });

    it("rejects a malformed support email", () => {
      expect(validateBrandConfig({ supportEmail: "not-an-email" }).ok).toBe(false);
    });

    it("rejects an over-long display name", () => {
      expect(validateBrandConfig({ displayName: "x".repeat(81) }).ok).toBe(false);
    });

    it("accepts an entirely empty brand — partners start with nothing set", () => {
      expect(validateBrandConfig({})).toEqual({ ok: true, config: {} });
    });
  });

  describe("resolveBrand — what a page actually renders", () => {
    const defaults = {
      displayName: "Servd",
      primaryColor: "#FF8A1E",
      accentColor: "#FF4D6D",
      supportEmail: "help@servdph.com",
    };

    it("prefers the partner's value", () => {
      const out = resolveBrand({ displayName: "CebuEats" }, defaults);
      expect(out.displayName).toBe("CebuEats");
    });

    it("falls back for anything the partner has not set", () => {
      const out = resolveBrand({ displayName: "CebuEats" }, defaults);
      expect(out.primaryColor).toBe("#FF8A1E");
      expect(out.supportEmail).toBe("help@servdph.com");
    });

    it("does not let a blank value erase the default", () => {
      // A half-filled brand config must not produce a page with no support
      // contact on it — parse drops the empty string, so the default survives.
      const out = resolveBrand(parseBrandConfig({ supportEmail: "" }), defaults);
      expect(out.supportEmail).toBe("help@servdph.com");
    });
  });
});
