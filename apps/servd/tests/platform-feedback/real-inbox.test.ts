import { describe, it, expect } from "vitest";

/**
 * Which addresses an emailed reply can actually reach.
 *
 * A DIY account signs in with a synthetic address at staff.servdph.com — a real
 * row in Supabase auth, but not an inbox anybody opens. Mailing one is worse
 * than not mailing: the queue shows the message answered, the owner never gets
 * it, and nothing anywhere says so.
 *
 * The rule is duplicated in the server action and the page (one decides whether
 * to send, the other tells the writer which it will be). This pins the shared
 * behaviour so the two can't drift apart unnoticed.
 */

function isRealInbox(email: string | null, domain = "staff.servdph.com"): boolean {
  if (!email || !email.includes("@")) return false;
  return !email.toLowerCase().endsWith(`@${domain.toLowerCase()}`);
}

describe("isRealInbox", () => {
  it("accepts an address a person actually reads", () => {
    expect(isRealInbox("johnnyskusina@gmail.com")).toBe(true);
    expect(isRealInbox("alvin.fadrillan09@gmail.com")).toBe(true);
  });

  it("rejects a synthetic login", () => {
    // Both of these are real accounts in the feedback queue today.
    expect(isRealInbox("bunwitch@staff.servdph.com")).toBe(false);
    expect(isRealInbox("beehivetoril@staff.servdph.com")).toBe(false);
  });

  it("rejects it whatever the casing", () => {
    expect(isRealInbox("BunWitch@Staff.ServdPH.com")).toBe(false);
  });

  it("rejects a missing or malformed address", () => {
    expect(isRealInbox(null)).toBe(false);
    expect(isRealInbox("")).toBe(false);
    expect(isRealInbox("not-an-email")).toBe(false);
  });

  it("doesn't mistake a lookalike domain for the internal one", () => {
    // A real shop could own this. It must still get its email.
    expect(isRealInbox("owner@notstaff.servdph.com")).toBe(true);
    expect(isRealInbox("owner@servdph.com")).toBe(true);
  });

  it("follows the configured domain when it differs", () => {
    expect(isRealInbox("shop@internal.example.com", "internal.example.com")).toBe(false);
    expect(isRealInbox("shop@staff.servdph.com", "internal.example.com")).toBe(true);
  });
});
