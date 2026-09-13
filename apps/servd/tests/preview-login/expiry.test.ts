import { describe, it, expect } from "vitest";
import {
  expiryLabel,
  isExpired,
  isPreviewLogin,
  previewExpiryFrom,
  previewLoginUsable,
  PREVIEW_LOGIN_DAYS,
} from "@/lib/preview-login/expiry";

/**
 * This gates a login on a storefront a real restaurant may later take over, so
 * the tests that matter are the ones where it must REFUSE.
 */

const NOW = new Date("2026-09-07T09:00:00+08:00");
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000);
const agoDays = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("previewExpiryFrom", () => {
  it("issues a login lasting a week", () => {
    expect(PREVIEW_LOGIN_DAYS).toBe(7);
    expect(previewExpiryFrom(NOW).toISOString()).toBe(inDays(7).toISOString());
  });
});

describe("isPreviewLogin", () => {
  it("is what the expiry column means — no second flag", () => {
    expect(isPreviewLogin(inDays(3))).toBe(true);
    expect(isPreviewLogin(null)).toBe(false);
    // Every staff row that predates this feature has NULL and must read as a
    // real account, or existing logins would be treated as throwaways.
    expect(isPreviewLogin(undefined)).toBe(false);
  });
});

describe("isExpired", () => {
  it("lets a live preview through and stops a lapsed one", () => {
    expect(isExpired(inDays(1), NOW)).toBe(false);
    expect(isExpired(agoDays(1), NOW)).toBe(true);
  });

  it("treats the exact moment of expiry as expired", () => {
    expect(isExpired(NOW, NOW)).toBe(true);
  });

  it("never expires a permanent account", () => {
    expect(isExpired(null, NOW)).toBe(false);
  });

  it("refuses an unreadable date rather than allowing it", () => {
    // Failing open here would silently turn a corrupt timestamp into a
    // permanent login on somebody's real storefront.
    expect(isExpired("not a date", NOW)).toBe(true);
    expect(previewLoginUsable("not a date", NOW)).toBe(false);
  });

  it("accepts an ISO string as well as a Date", () => {
    expect(isExpired(inDays(2).toISOString(), NOW)).toBe(false);
    expect(isExpired(agoDays(2).toISOString(), NOW)).toBe(true);
  });
});

describe("previewLoginUsable", () => {
  it("is the one question the login path asks", () => {
    expect(previewLoginUsable(null, NOW)).toBe(true);
    expect(previewLoginUsable(inDays(1), NOW)).toBe(true);
    expect(previewLoginUsable(agoDays(1), NOW)).toBe(false);
  });
});

describe("expiryLabel", () => {
  it("counts down in whole days, then hours, then minutes", () => {
    expect(expiryLabel(inDays(7), NOW)).toBe("7 days left");
    expect(expiryLabel(inDays(1), NOW)).toBe("1 day left");
    expect(expiryLabel(new Date(NOW.getTime() + 4 * 3_600_000), NOW)).toBe("4 hours left");
    expect(expiryLabel(new Date(NOW.getTime() + 90_000), NOW)).toBe("1 minute left");
  });

  it("never rounds a live login down to zero", () => {
    // "0 minutes left" reads as dead on a login that still works.
    expect(expiryLabel(new Date(NOW.getTime() + 5_000), NOW)).toBe("1 minute left");
  });

  it("says so plainly when it has lapsed", () => {
    expect(expiryLabel(agoDays(1), NOW)).toBe("Expired");
  });

  it("distinguishes a permanent account from an expired one", () => {
    expect(expiryLabel(null, NOW)).toBe("Never expires");
  });
});
