import { describe, it, expect } from "vitest";
import { normalizeUsername, USERNAME_MAX } from "@/lib/partners/login-username";

describe("normalizeUsername", () => {
  it("accepts a plain handle", () => {
    expect(normalizeUsername("mangbens")).toEqual({ ok: true, username: "mangbens" });
  });

  it("lower-cases, so the owner can't fail to log in over capitalisation", () => {
    expect(normalizeUsername("MangBens")).toEqual({ ok: true, username: "mangbens" });
  });

  it("trims — a pasted business name arrives with whitespace", () => {
    expect(normalizeUsername("  mang.bens  ")).toEqual({ ok: true, username: "mang.bens" });
  });

  it("allows dot, dash and underscore", () => {
    expect(normalizeUsername("mang_bens-bbq.ph")).toEqual({ ok: true, username: "mang_bens-bbq.ph" });
  });

  it("rejects a space — it becomes the local part of an email address", () => {
    expect(normalizeUsername("mang bens")).toEqual({
      ok: false,
      error: "Letters, numbers, dot, dash, underscore",
    });
  });

  it("rejects an @, which would forge a second address", () => {
    const r = normalizeUsername("mang@bens.com");
    expect(r.ok).toBe(false);
  });

  it("rejects too short, counting after the trim", () => {
    expect(normalizeUsername(" ab ")).toEqual({
      ok: false,
      error: "Username must be at least 3 characters",
    });
  });

  it("rejects blank and non-strings rather than throwing", () => {
    expect(normalizeUsername("").ok).toBe(false);
    expect(normalizeUsername(null).ok).toBe(false);
    expect(normalizeUsername(undefined).ok).toBe(false);
    expect(normalizeUsername(42).ok).toBe(false);
  });

  it("caps the length", () => {
    expect(normalizeUsername("a".repeat(USERNAME_MAX)).ok).toBe(true);
    expect(normalizeUsername("a".repeat(USERNAME_MAX + 1)).ok).toBe(false);
  });

  it("keeps digits — plenty of shops are named with one", () => {
    expect(normalizeUsername("7eleven.cebu")).toEqual({ ok: true, username: "7eleven.cebu" });
  });
});
