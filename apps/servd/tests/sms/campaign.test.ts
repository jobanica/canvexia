import { describe, it, expect } from "vitest";
import {
  DEFAULT_WINDOW,
  capReached,
  manilaMinutes,
  minutesToLabel,
  nextSendTime,
  renderMerge,
  withinWindow,
  worstCaseBody,
} from "@servd/core";

/**
 * The send window and the frequency cap: the two things that decide whether
 * this is a marketing tool or a nuisance.
 *
 * Both are pure so they can be tested at a fixed clock. The window is the one
 * that gets Manila wrong — the server runs on UTC, and 09:00 Manila is 01:00
 * UTC, so anything that reasons about "today" from a UTC date is off by eight
 * hours for a third of every day.
 */

// 2026-09-15, 10:30 Manila = 02:30 UTC. Inside the default window.
const INSIDE = new Date("2026-09-15T02:30:00.000Z");
// 21:00 Manila = 13:00 UTC. After it closes.
const AFTER = new Date("2026-09-15T13:00:00.000Z");
// 07:00 Manila = 23:00 UTC on the PREVIOUS UTC date. Before it opens, and the
// case where UTC and Manila disagree about what day it is.
const BEFORE = new Date("2026-09-14T23:00:00.000Z");

describe("the send window", () => {
  it("reads the clock in Manila, not in UTC", () => {
    expect(manilaMinutes(INSIDE)).toBe(10 * 60 + 30);
    expect(manilaMinutes(BEFORE)).toBe(7 * 60);
    expect(minutesToLabel(DEFAULT_WINDOW.startMin)).toBe("09:00");
    expect(minutesToLabel(DEFAULT_WINDOW.endMin)).toBe("20:00");
  });

  it("is open during the day and shut at night", () => {
    expect(withinWindow(INSIDE)).toBe(true);
    expect(withinWindow(AFTER)).toBe(false);
    expect(withinWindow(BEFORE)).toBe(false);
  });

  it("sends now when it is open", () => {
    expect(nextSendTime(INSIDE).getTime()).toBe(INSIDE.getTime());
  });

  it("queues to this morning when it is too early", () => {
    const next = nextSendTime(BEFORE);
    // 09:00 Manila on the 15th = 01:00 UTC on the 15th.
    expect(next.toISOString()).toBe("2026-09-15T01:00:00.000Z");
  });

  it("queues to TOMORROW morning when it is too late", () => {
    // The case a naive implementation gets wrong by sending the backlog at one
    // minute past midnight.
    const next = nextSendTime(AFTER);
    expect(next.toISOString()).toBe("2026-09-16T01:00:00.000Z");
    expect(withinWindow(next)).toBe(true);
  });

  it("respects a partner's own window", () => {
    const window = { startMin: 8 * 60, endMin: 17 * 60 };
    // 17:30 Manila = 09:30 UTC, outside an 08:00–17:00 window.
    const evening = new Date("2026-09-15T09:30:00.000Z");
    expect(withinWindow(evening, window)).toBe(false);
    expect(nextSendTime(evening, window).toISOString()).toBe("2026-09-16T00:00:00.000Z");
  });
});

describe("the frequency cap", () => {
  const now = new Date("2026-09-15T02:00:00.000Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  it("counts a rolling window, not a calendar week", () => {
    expect(capReached([daysAgo(1), daysAgo(3)], now)).toBe(true);
    expect(capReached([daysAgo(1)], now)).toBe(false);
    // Eight days ago has aged out.
    expect(capReached([daysAgo(1), daysAgo(8)], now)).toBe(false);
  });

  it("is per contact, so a fresh campaign does not reset it", () => {
    // Three campaigns each obeying their own cap is still three texts to one
    // person in a week.
    expect(capReached([daysAgo(0), daysAgo(2)], now)).toBe(true);
  });

  it("honours a partner's own cap", () => {
    expect(capReached([daysAgo(1)], now, { count: 1, days: 7 })).toBe(true);
    expect(capReached([daysAgo(1), daysAgo(2)], now, { count: 4, days: 7 })).toBe(false);
  });

  it("treats a cap of zero as 'never'", () => {
    expect(capReached([], now, { count: 0, days: 7 })).toBe(true);
  });
});

describe("merge fields", () => {
  it("falls back to something that still reads as a sentence", () => {
    // "Hi ," tells the recipient exactly how much attention they are getting.
    expect(renderMerge("Hi {name},", {})).toBe("Hi there,");
    expect(renderMerge("Hi {name},", { name: "  " })).toBe("Hi there,");
    expect(renderMerge("Hi {name},", { name: "Ana" })).toBe("Hi Ana,");
  });

  it("leaves an unknown field alone rather than blanking it", () => {
    // Blanking it would silently delete part of somebody's message.
    expect(renderMerge("Hi {nickname}", {})).toBe("Hi {nickname}");
  });

  it("fills business, staff and partner names", () => {
    const out = renderMerge("{business_name} — {staff_name} of {partner_name}", {
      businessName: "Nena's Carinderia",
      staffName: "Ana",
      partnerName: "Tagum City Partner",
    });
    expect(out).toBe("Nena's Carinderia — Ana of Tagum City Partner");
  });

  it("falls back staff_name to the partner, not to nothing", () => {
    expect(renderMerge("{staff_name}", { partnerName: "Tagum City Partner" })).toBe(
      "Tagum City Partner",
    );
  });
});

describe("the composer's counter", () => {
  it("measures the LONGEST message anybody will get", () => {
    // Merge fields make every recipient's message a different length, so a
    // counter that measures the template is wrong for everybody — and wrong in
    // the direction that under-quotes the cost.
    const body = worstCaseBody("Hi {name}, deals at {business_name}!", [
      { name: "Al", businessName: "Kit" },
      { name: "Bartolome", businessName: "The Very Long Carinderia Name" },
    ]);
    expect(body).toContain("Bartolome");
    expect(body).toContain("The Very Long Carinderia Name");
  });

  it("uses the fallbacks when there is nobody to sample", () => {
    expect(worstCaseBody("Hi {name}", [])).toBe("Hi there");
  });
});

/**
 * Four rules the sender holds that only source can check.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "../../src");
const codeOf = (p: string) =>
  readFileSync(join(SRC, p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("what the sender must keep doing", () => {
  const campaigns = codeOf("server/partners/sms-campaigns.ts");

  it("charges BEFORE the provider call, and refunds a rejection", () => {
    // Send-then-debit sends texts a partner cannot pay for the moment the
    // balance runs out mid-campaign, and there is no un-sending one.
    const debitAt = campaigns.indexOf("const paid = await debit(");
    const sendAt = campaigns.indexOf("await provider.send(");
    expect(debitAt).toBeGreaterThan(-1);
    expect(debitAt).toBeLessThan(sendAt);
    expect(campaigns).toContain('await refund(partnerId, segments, "sms_refund")');
  });

  it("claims a campaign before draining it", () => {
    // Two overlapping cron ticks would otherwise both send the same batch.
    expect(campaigns).toContain('data: { status: "sending", startedAt: now }');
    expect(campaigns).toContain("if (claimed.count === 0) continue");
  });

  it("stops rather than over-sends when the cap cannot be counted", () => {
    const fn = campaigns.slice(campaigns.indexOf("async function eligible"));
    const guard = fn.slice(fn.indexOf("} catch {"));
    expect(guard.slice(0, 200)).toContain("keep: []");
  });

  it("never lets an audience include somebody who has not opted in", () => {
    const audience = codeOf("server/partners/sms-audience.ts");
    expect(audience).toContain('consentStatus: "opted_in"');
    // …and there is no filter key that could switch it off.
    expect(audience).not.toMatch(/consentStatus:\s*filters\./);
  });

  it("sends a test to the seat's OWN number, never one typed into a form", () => {
    // A "test send" that accepts an arbitrary number is a way to text anybody
    // without consent, which is what the rest of this module prevents.
    const actions = codeOf("server/partners/sms-campaign-actions.ts");
    const test = actions.slice(
      actions.indexOf("export async function testSendAction"),
      actions.indexOf("export async function createCampaignAction"),
    );
    expect(test).toContain("tx.partnerUser.findUnique");
    expect(test).not.toMatch(/formData\.get\("(mobile|to|phone)"\)/);
  });

  it("parses a scheduled time as Manila, not as the server's clock", () => {
    const actions = codeOf("server/partners/sms-campaign-actions.ts");
    expect(actions).toContain('new Date(`${when}:00+08:00`)');
  });
});
