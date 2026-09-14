import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isSyntheticLogin } from "@/lib/branding/app-domain";

/**
 * Which addresses an emailed reply can actually reach.
 *
 * A DIY account signs in with a synthetic address on the internal login domain
 * — a real row in Supabase auth, but not an inbox anybody opens. Mailing one is
 * worse than not mailing: the queue shows the message answered, the owner never
 * gets it, and nothing anywhere says so.
 *
 * This file used to reimplement the rule with the domain as a default argument,
 * which meant it passed while the shipped page had the domain spelled out and
 * wrong. It now exercises `isSyntheticLogin` — the function the server action
 * and the page both call — so the two cannot drift from each other or from this.
 */
const saved = process.env.INTERNAL_LOGIN_DOMAIN;

beforeEach(() => {
  process.env.INTERNAL_LOGIN_DOMAIN = "staff.example.ph";
});
afterEach(() => {
  if (saved === undefined) delete process.env.INTERNAL_LOGIN_DOMAIN;
  else process.env.INTERNAL_LOGIN_DOMAIN = saved;
});

function isRealInbox(email: string | null): boolean {
  if (!email || !email.includes("@")) return false;
  return !isSyntheticLogin(email);
}

describe("isRealInbox", () => {
  it("accepts an address a person actually reads", () => {
    expect(isRealInbox("owner@gmail.com")).toBe(true);
    expect(isRealInbox("shop.owner+orders@example.com")).toBe(true);
  });

  it("rejects a synthetic login", () => {
    expect(isRealInbox("bunwitch@staff.example.ph")).toBe(false);
    expect(isRealInbox("beehivetoril@staff.example.ph")).toBe(false);
  });

  it("rejects it whatever the casing", () => {
    expect(isRealInbox("BunWitch@Staff.Example.PH")).toBe(false);
  });

  it("rejects a missing or malformed address", () => {
    expect(isRealInbox(null)).toBe(false);
    expect(isRealInbox("")).toBe(false);
    expect(isRealInbox("not-an-email")).toBe(false);
  });

  it("doesn't mistake a lookalike domain for the internal one", () => {
    // A real shop could own this. It must still get its email.
    expect(isRealInbox("owner@notstaff.example.ph")).toBe(true);
    expect(isRealInbox("owner@example.ph")).toBe(true);
  });

  it("follows the configured domain rather than a literal", () => {
    process.env.INTERNAL_LOGIN_DOMAIN = "internal.example.com";
    expect(isRealInbox("shop@internal.example.com")).toBe(false);
    // Was synthetic on the old domain; on this deployment it is somebody's
    // real address and must get its reply.
    expect(isRealInbox("shop@staff.example.ph")).toBe(true);
  });
});
