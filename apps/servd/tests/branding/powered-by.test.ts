import { describe, it, expect } from "vitest";
import {
  POWERED_BY_SINCE,
  servdBranding,
  NO_SERVD_BRANDING,
} from "@/lib/branding/powered-by";

/**
 * Two rules that must not be confused with each other:
 *
 *   - the FOOTER is new, so it goes on new accounts only — nobody who was
 *     already trading wakes up to a supplier's name on their storefront;
 *   - the SPLASH already showed for everyone, so nobody loses it by being old.
 *     It answers one question it never asked before: has this restaurant bought
 *     the white-label unlock?
 */

const BEFORE = "2026-08-20T23:59:59+08:00"; // one second before the cutoff, Manila
const AFTER = "2026-08-21T00:00:01+08:00";

describe("servdBranding — grandfathering", () => {
  it("brands an account created after the cutoff", () => {
    expect(servdBranding({ createdAt: AFTER, ownsWhiteLabel: false })).toEqual({
      showFooter: true,
      showSplash: true,
    });
  });

  it("leaves an account that was already trading alone", () => {
    expect(servdBranding({ createdAt: BEFORE, ownsWhiteLabel: false }).showFooter).toBe(false);
  });

  it("keeps the QR splash for a grandfathered account", () => {
    // Grandfathering is about not ADDING anything. The splash was already
    // there, so taking it away would be a change in the wrong direction.
    expect(servdBranding({ createdAt: BEFORE, ownsWhiteLabel: false }).showSplash).toBe(true);
  });

  it("counts an account created exactly at the cutoff as new", () => {
    expect(servdBranding({ createdAt: POWERED_BY_SINCE, ownsWhiteLabel: false }).showFooter).toBe(
      true,
    );
  });

  it("reads a Date the same as an ISO string", () => {
    const asDate = servdBranding({ createdAt: new Date(AFTER), ownsWhiteLabel: false });
    expect(asDate).toEqual(servdBranding({ createdAt: AFTER, ownsWhiteLabel: false }));
  });
});

describe("servdBranding — white-label", () => {
  it("removes BOTH marks for a new account that bought it", () => {
    expect(servdBranding({ createdAt: AFTER, ownsWhiteLabel: true })).toEqual({
      showFooter: false,
      showSplash: false,
    });
  });

  it("removes the splash for an OLD account that bought it", () => {
    // The gap this closes: white-label used to hide one line in the admin
    // sidebar while the diners' full-screen splash carried on.
    expect(servdBranding({ createdAt: BEFORE, ownsWhiteLabel: true }).showSplash).toBe(false);
  });
});

describe("servdBranding — bad or missing dates", () => {
  it("does not brand a restaurant it cannot date", () => {
    for (const createdAt of [null, undefined, "", "not a date"]) {
      expect(servdBranding({ createdAt, ownsWhiteLabel: false }).showFooter).toBe(false);
    }
  });
});

describe("NO_SERVD_BRANDING", () => {
  it("is how the menu behaved before any of this existed", () => {
    // The fallback when a lookup fails, and the default prop: splash yes,
    // footer no. Failing towards "don't stamp somebody's page" is the safe
    // direction, and failing towards "keep what was already there" is the
    // non-surprising one.
    expect(NO_SERVD_BRANDING).toEqual({ showFooter: false, showSplash: true });
  });
});
