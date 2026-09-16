import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  BUCKET_MS,
  bucketOf,
  kioskCode,
  kioskScanUrl,
  verifyKioskCode,
} from "@/lib/partners/kiosk-token";
// A separate module because the scanner is a CLIENT component: kiosk-token
// imports node:crypto, which cannot be bundled for a browser.
import { parseScan } from "@/lib/partners/kiosk-scan";

/**
 * The rotating kiosk code.
 *
 * Pure by design, so the four cases the brief names are decidable at a FIXED
 * CLOCK rather than by waiting a minute in a test: a valid code, a two-minute
 * old code, another partner's kiosk, and a tampered one.
 */

const KIOSK = { secret: "s".repeat(64), partnerId: "p-1", kioskId: "k-1" };
// A fixed instant, mid-bucket. Mid rather than on the boundary on purpose: a
// test pinned to :00 would pass for a window that is off by one bucket.
const T0 = new Date("2026-09-15T04:30:30.000Z").getTime();

describe("a code and its window", () => {
  it("verifies the code minted for this minute", () => {
    expect(verifyKioskCode(KIOSK, kioskCode(KIOSK, T0), T0)).toBe(true);
  });

  it("still verifies the PREVIOUS minute's code", () => {
    // The scan that starts at 59.8 seconds past. Without this, a clock-in fails
    // for a reason the person has no way to understand, and they blame the app.
    const old = kioskCode(KIOSK, T0 - BUCKET_MS);
    expect(verifyKioskCode(KIOSK, old, T0)).toBe(true);
  });

  it("refuses a code two minutes old", () => {
    const stale = kioskCode(KIOSK, T0 - 2 * BUCKET_MS);
    expect(verifyKioskCode(KIOSK, stale, T0)).toBe(false);
  });

  it("refuses a code from the future", () => {
    // A tablet whose clock is fast should not be able to pre-mint codes; the
    // window looks backwards only.
    expect(verifyKioskCode(KIOSK, kioskCode(KIOSK, T0 + 2 * BUCKET_MS), T0)).toBe(false);
  });

  it("refuses another partner's kiosk even on the same secret", () => {
    // The partner id is IN the MAC, not just the lookup. Two operators who ever
    // ended up sharing a secret by accident still cannot use each other's
    // codes.
    const other = { ...KIOSK, partnerId: "p-2" };
    expect(verifyKioskCode(other, kioskCode(KIOSK, T0), T0)).toBe(false);
  });

  it("refuses another kiosk of the same partner", () => {
    const sibling = { ...KIOSK, kioskId: "k-2" };
    expect(verifyKioskCode(sibling, kioskCode(KIOSK, T0), T0)).toBe(false);
  });

  it("refuses a tampered code, and an empty one", () => {
    const code = kioskCode(KIOSK, T0);
    const tampered = (code[0] === "A" ? "B" : "A") + code.slice(1);
    expect(verifyKioskCode(KIOSK, tampered, T0)).toBe(false);
    expect(verifyKioskCode(KIOSK, "", T0)).toBe(false);
    // A wrong-length code must be a plain false, not a throw: timingSafeEqual
    // raises on mismatched lengths, which would 500 the check-in.
    expect(verifyKioskCode(KIOSK, "short", T0)).toBe(false);
  });

  it("changes every minute and is not guessable from the last one", () => {
    const a = kioskCode(KIOSK, T0);
    const b = kioskCode(KIOSK, T0 + BUCKET_MS);
    expect(a).not.toBe(b);
    expect(a).toHaveLength(12);
  });

  it("buckets on the minute", () => {
    expect(bucketOf(T0)).toBe(bucketOf(T0 + 10_000));
    expect(bucketOf(T0)).not.toBe(bucketOf(T0 + BUCKET_MS));
  });
});

describe("what the phone scans", () => {
  it("is a URL a camera app can open", () => {
    const url = kioskScanUrl("https://canvexia.com/", KIOSK, T0);
    expect(url.startsWith("https://canvexia.com/partner/attendance?")).toBe(true);
    const parsed = parseScan(url);
    expect(parsed).toEqual({ kioskId: "k-1", code: kioskCode(KIOSK, T0) });
  });

  it("also reads a bare id:code, for the in-app scanner", () => {
    expect(parseScan("k-1:abc")).toEqual({ kioskId: "k-1", code: "abc" });
  });

  it("returns null for anything else", () => {
    // A QR code on a poster, a wifi code, a receipt. Scanning one of those is
    // an honest "that is not a kiosk code", not a check-in attempt.
    expect(parseScan("")).toBeNull();
    expect(parseScan("hello")).toBeNull();
    expect(parseScan("https://example.test/")).toBeNull();
  });
});

/**
 * The secret must not be reachable from a browser.
 *
 * Anybody holding a kiosk's secret can mint valid clock-in codes from home,
 * which is the entire threat this design exists against. Three places could
 * leak it and none of them is obvious in review.
 */
describe("the secret stays on the server", () => {
  const read = (p: string) => readFileSync(join(__dirname, "../../src", p), "utf8");

  it("is never selected by the list the manager screen renders", () => {
    const src = read("server/partners/kiosk.ts");
    const list = src.slice(src.indexOf("export async function listKiosks"), src.indexOf("export async function createKiosk"));
    expect(list).not.toContain("secret: true");
  });

  it("is not shipped to any client component", () => {
    // COMMENTS STRIPPED FIRST. Both kiosk components explain in prose that they
    // never see the secret, and a raw scan would count those sentences as the
    // leak they are describing.
    const dir = join(__dirname, "../../src/components/partner");
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith(".tsx"))
      .filter((f) => {
        const src = readFileSync(join(dir, f), "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
          .replace(/(^|[^:])\/\/.*$/gm, "$1");
        return src.includes('"use client"') && /\bsecret\b/.test(src);
      });
    expect(offenders).toEqual([]);
  });

  it("keeps attendance_kiosks super-only in RLS", () => {
    // A partner_scope policy here would be the obvious thing to write and would
    // hand every seat in the partner a readable `secret` column.
    const rls = readFileSync(
      join(__dirname, "../../../../packages/db/prisma/rls.sql"),
      "utf8",
    );
    const block = rls.slice(rls.indexOf("attendance_kiosks holds a SIGNING SECRET"));
    const own = block.slice(0, block.indexOf("Backstop:"));
    expect(own).toContain("create policy super_only on \"attendance_kiosks\"");
    expect(own).not.toContain("create policy partner_scope on \"attendance_kiosks\"");
  });
});

/**
 * The fourth case the brief names — a `kioskRequired` seat trying to clock in
 * without a scan — lives in `attendance-actions.ts`, which talks to the
 * database and so cannot run here. What can be held without one is that the
 * decision is still shaped the way it has to be.
 */
describe("the clock-in decision", () => {
  const code = readFileSync(
    join(__dirname, "../../src/server/partners/attendance-actions.ts"),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const resolve = code.slice(code.indexOf("async function resolveKiosk"), code.indexOf("export async function checkInAction"));

  it("refuses a required seat that sent no scan", () => {
    expect(resolve).toContain("kioskRequired(who.partnerId, who.userId)");
    expect(resolve).toMatch(/ok: false, error: "Scan the kiosk code/);
  });

  it("never falls back to GPS after a failed scan", () => {
    // A stale code quietly becoming a gps check-in would mean the method column
    // lies about somebody who was standing at the kiosk, and nobody would ever
    // find out the screen had frozen.
    const failure = resolve.indexOf("SCAN_MESSAGE[scan.reason]");
    // lastIndexOf: the first `method: "gps"` in the file is the return TYPE
    // annotation, which sits above the failure branch.
    const fallback = resolve.lastIndexOf('method: "gps"');
    expect(failure).toBeGreaterThan(-1);
    // The refusal RETURNS; the gps path is only reached when no scan was sent.
    expect(resolve.slice(failure, fallback)).toContain("return");
  });

  it("gates both halves of the day, not just the check-in", () => {
    expect(code).toContain("const kiosk = await resolveKiosk(who, formData);");
    expect(code.match(/await resolveKiosk\(who, formData\)/g)?.length).toBe(2);
  });
});
