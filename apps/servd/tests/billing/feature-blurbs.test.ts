import { describe, it, expect } from "vitest";
import { ALL_FEATURES, FEATURE_META } from "@/lib/billing/features";
import { DEFAULT_FEATURE_PRICES } from "@/lib/billing/feature-pricing";

/**
 * A locked screen now sells its own unlock in place, instead of bouncing the
 * owner to a billing page listing every paid feature at once.
 *
 * That card is rendered from FEATURE_META, so a feature with no blurb shows a
 * lock screen with a heading and a blank space where the explanation should be.
 * Nothing else in the app reads `blurb`, so nothing else would catch it.
 */

describe("every gateable feature can render its own lock card", () => {
  it("has a blurb", () => {
    const missing = FEATURE_META.filter((f) => !f.blurb?.trim()).map((f) => f.key);
    expect(missing).toEqual([]);
  });

  it("describes what you get, not what you're missing", () => {
    // The owner is standing on the page they just tried to open. "Locked",
    // "upgrade" and "unlock" belong on the button, not in the explanation.
    const preachy = FEATURE_META.filter((f) => /\b(locked|upgrade|unlock)\b/i.test(f.blurb));
    expect(preachy.map((f) => f.key)).toEqual([]);
  });

  it("stays short enough to read at a glance", () => {
    const tooLong = FEATURE_META.filter((f) => f.blurb.length > 140).map((f) => f.key);
    expect(tooLong).toEqual([]);
  });

  it("covers every feature exactly once", () => {
    expect(FEATURE_META.map((f) => f.key).sort()).toEqual([...ALL_FEATURES].sort());
    expect(new Set(FEATURE_META.map((f) => f.key)).size).toBe(FEATURE_META.length);
  });
});

describe("the price shown on a lock card", () => {
  it("is set for everything sold as a one-time unlock", () => {
    // A sellable feature priced at zero would render "Unlock for ₱0.00".
    const broken = ALL_FEATURES.filter(
      (f) => DEFAULT_FEATURE_PRICES[f].enabled && DEFAULT_FEATURE_PRICES[f].price <= 0,
    );
    expect(broken).toEqual([]);
  });

  it("leaves the metered and monthly ones unsellable, so the card offers no button", () => {
    // SMS burns credits per text and the scheduler is billed monthly — neither
    // can be bought once, and a one-time button would take money for nothing.
    expect(DEFAULT_FEATURE_PRICES.sms.enabled).toBe(false);
    expect(DEFAULT_FEATURE_PRICES.contentScheduler.enabled).toBe(false);
  });
});
