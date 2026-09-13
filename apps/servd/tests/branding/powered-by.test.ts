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

/**
 * THE IDENTITY GATE for Phase 5.
 *
 * Two systems now answer "does the Servd badge appear": the merchant's paid
 * white-label unlock, and their partner's contracted brand mode. The promise
 * made when adding the second was that servdph.com renders exactly as before —
 * so the first block below is not a nicety, it is the gate. Every existing
 * account belongs to a partner on "powered_by" (the house partner), and every
 * existing caller passes no brand mode at all.
 */
describe("servdBranding — partner brand mode", () => {
  const BEFORE = "2026-01-01T00:00:00+08:00"; // grandfathered
  const AFTER = "2026-09-01T00:00:00+08:00"; // post-cutoff

  describe("identity: nothing changes for a powered_by partner", () => {
    const cases = [
      { createdAt: BEFORE, ownsWhiteLabel: false },
      { createdAt: AFTER, ownsWhiteLabel: false },
      { createdAt: BEFORE, ownsWhiteLabel: true },
      { createdAt: AFTER, ownsWhiteLabel: true },
      { createdAt: null, ownsWhiteLabel: false },
      { createdAt: undefined, ownsWhiteLabel: false },
    ];

    it.each(cases)("absent brand mode matches the old answer: %o", (input) => {
      // The "old answer" written out longhand, so this test fails if the rule
      // drifts rather than silently agreeing with a changed implementation.
      const old = input.ownsWhiteLabel
        ? { showFooter: false, showSplash: false }
        : {
            showFooter: !!input.createdAt && Date.parse(String(input.createdAt)) >= Date.parse(POWERED_BY_SINCE),
            showSplash: true,
          };
      expect(servdBranding(input)).toEqual(old);
    });

    it.each(cases)("an explicit powered_by is the same as absent: %o", (input) => {
      expect(servdBranding({ ...input, partnerBrandMode: "powered_by" })).toEqual(
        servdBranding(input),
      );
    });

    it.each(cases)("a null brand mode is the same as absent: %o", (input) => {
      expect(servdBranding({ ...input, partnerBrandMode: null })).toEqual(servdBranding(input));
    });

    it("an unrecognised brand mode does not silently white-label", () => {
      // Fail towards the status quo: only the exact contracted value suppresses.
      expect(servdBranding({ createdAt: AFTER, ownsWhiteLabel: false, partnerBrandMode: "nonsense" }))
        .toEqual(servdBranding({ createdAt: AFTER, ownsWhiteLabel: false }));
    });
  });

  describe("either side suppresses the badge, neither reinstates it", () => {
    it("a full_whitelabel partner removes it for a merchant who never bought it", () => {
      expect(
        servdBranding({ createdAt: AFTER, ownsWhiteLabel: false, partnerBrandMode: "full_whitelabel" }),
      ).toEqual({ showFooter: false, showSplash: false });
    });

    it("a paid unlock still removes it under a powered_by partner", () => {
      // The merchant paid for exactly this; a partner term cannot put it back.
      expect(
        servdBranding({ createdAt: AFTER, ownsWhiteLabel: true, partnerBrandMode: "powered_by" }),
      ).toEqual({ showFooter: false, showSplash: false });
    });

    it("removes the splash too, not just the footer", () => {
      // The QR splash was never grandfathered — it showed for everyone — so a
      // white-label partner's diners must not meet a full-screen Servd logo.
      const b = servdBranding({
        createdAt: BEFORE,
        ownsWhiteLabel: false,
        partnerBrandMode: "full_whitelabel",
      });
      expect(b.showSplash).toBe(false);
    });

    it("grandfathering still applies within a powered_by partner", () => {
      expect(
        servdBranding({ createdAt: BEFORE, ownsWhiteLabel: false, partnerBrandMode: "powered_by" })
          .showFooter,
      ).toBe(false);
      expect(
        servdBranding({ createdAt: AFTER, ownsWhiteLabel: false, partnerBrandMode: "powered_by" })
          .showFooter,
      ).toBe(true);
    });
  });
});
