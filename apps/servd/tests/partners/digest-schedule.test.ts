import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { manilaYesterday } from "@/server/partners/digest";

/**
 * The daily digest's two failure modes that are not about content.
 *
 * `composeDigest` has been tested since A5 — what it says, and when it says
 * nothing. What was never tested is that anything CALLS it, and that the window
 * it is called for is the right one.
 */

describe("manilaYesterday", () => {
  // Manila is UTC+8, no DST, so a Manila day runs 16:00 UTC to 16:00 UTC.
  it("returns the Manila day that just closed, for a 23:00 UTC firing", () => {
    // 23:00 UTC on 14 Sep is 07:00 Manila on the 15th. Yesterday there is the
    // 14th: 2026-09-13T16:00Z to 2026-09-14T16:00Z.
    const { from, to } = manilaYesterday(new Date("2026-09-14T23:00:00Z"));
    expect(from.toISOString()).toBe("2026-09-13T16:00:00.000Z");
    expect(to.toISOString()).toBe("2026-09-14T16:00:00.000Z");
  });

  it("is exactly 24 hours, and never straddles two Manila days", () => {
    const { from, to } = manilaYesterday(new Date("2026-09-14T23:00:00Z"));
    expect(to.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("does not slide with the firing time inside one Manila day", () => {
    // THE BUG THIS EXISTS FOR. "now minus 24 hours" would give a different
    // window for each of these; the Manila day boundary gives one.
    const early = manilaYesterday(new Date("2026-09-14T16:30:00Z")); // 00:30 Manila 15th
    const late = manilaYesterday(new Date("2026-09-15T15:30:00Z")); // 23:30 Manila 15th
    expect(early.from.toISOString()).toBe(late.from.toISOString());
    expect(early.to.toISOString()).toBe(late.to.toISOString());
  });

  it("crosses a month boundary correctly", () => {
    const { from, to } = manilaYesterday(new Date("2026-10-01T23:00:00Z")); // 2 Oct, Manila
    expect(from.toISOString()).toBe("2026-09-30T16:00:00.000Z");
    expect(to.toISOString()).toBe("2026-10-01T16:00:00.000Z");
  });
});

describe("the digest is actually wired", () => {
  const CRON_DIR = join(process.cwd(), "src/app/api/cron");

  it("has a route, and Vercel is told to call it", () => {
    // `composeDigest` sat in packages/db with a test file and no caller for a
    // whole phase. A route that exists but is not in vercel.json is the same
    // bug one layer up, and nothing else in this repository would notice.
    expect(readdirSync(CRON_DIR)).toContain("partner-digest");

    const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
      crons?: { path: string; schedule: string }[];
    };
    const cron = vercel.crons?.find((c) => c.path === "/api/cron/partner-digest");
    expect(cron, "partner-digest is not scheduled in vercel.json").toBeDefined();
    // 23:00 UTC is 07:00 Manila. Vercel Cron is UTC-only, so this is the only
    // way to express it, and it is the thing most likely to be "tidied" wrong.
    expect(cron?.schedule).toBe("0 23 * * *");
  });

  it("every cron route refuses a request without CRON_SECRET", () => {
    // Widened past the digest on purpose: these routes read and write across
    // every partner in the country with no session behind them.
    const offenders = readdirSync(CRON_DIR).filter((d) => {
      const src = readFileSync(join(CRON_DIR, d, "route.ts"), "utf8");
      return !src.includes("CRON_SECRET") || !src.includes("Unauthorized");
    });
    expect(offenders, `these cron routes are unguarded: ${offenders.join(", ")}`).toEqual([]);
  });

  it("calls composeDigest from application code, not only from a test", () => {
    const src = readFileSync(join(process.cwd(), "src/server/partners/digest.ts"), "utf8");
    expect(src).toContain("composeDigest");
    expect(src).toContain("outboundEmail");
  });
});
