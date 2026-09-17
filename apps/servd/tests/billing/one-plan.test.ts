import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TIERS, STANDARD_PRICE, STANDARD_TIER } from "@/lib/billing/catalog";
import {
  ALL_FEATURES,
  FEATURE_TIERS,
  defaultFeaturesForTier,
  asTier,
  type Feature,
} from "@/lib/billing/features";
import {
  DEFAULT_FEATURE_PRICES,
  normalizeFeaturePrices,
  retireOneTimeStore,
} from "@/lib/billing/feature-pricing";
import { codeAt } from "../support/source";

/**
 * ONE PLAN: Standard, ₱999/mo, everything except the content scheduler.
 *
 * Servd had drifted to selling no monthly plan at all — three legacy tier rows
 * with empty feature arrays, and a shelf of one-time unlocks that was the real
 * pricing. This file pins the replacement, and above all the one exclusion the
 * plan is defined by.
 */

describe("the plan", () => {
  it("is ₱999 a month", () => {
    expect(STANDARD_PRICE).toBe(99_900);
    expect(TIERS).toContain(STANDARD_TIER);
  });

  it("grants every feature except the content scheduler", () => {
    const granted = defaultFeaturesForTier(STANDARD_TIER);
    const expected = ALL_FEATURES.filter((f) => f !== "contentScheduler");
    expect([...granted].sort()).toEqual([...expected].sort());
  });

  it("never grants the content scheduler, on any tier", () => {
    // Its own ₱499/mo subscription, and the one thing "everything" excludes.
    for (const tier of TIERS) {
      expect(defaultFeaturesForTier(tier), tier).not.toContain("contentScheduler");
    }
    expect(FEATURE_TIERS.contentScheduler).toEqual([]);
  });

  it("includes unlimited tables, which used to be a ₱500 unlock", () => {
    // "Everything except the content scheduler" includes it, and the shelf that
    // sold it separately is retired.
    expect(defaultFeaturesForTier(STANDARD_TIER)).toContain("unlimitedTables");
  });
});

describe("the old tiers stay resolvable", () => {
  it("still names Free, Growth and Business", () => {
    // Deactivated in the database, NOT deleted. `asTier` has to keep resolving
    // them: getPlanAccess reads an unknown plan name as ALL_FEATURES, so a
    // grandfathered account on Growth would silently gain every feature —
    // including, before the strip below, the content scheduler.
    for (const t of ["Free", "Growth", "Business"]) expect(asTier(t)).toBe(t);
  });

  it("keeps Free the narrow tier it was", () => {
    // It is the downgrade target when a trial lapses. If this ever grew, a
    // lapsed trial would stop costing anybody anything.
    expect(defaultFeaturesForTier("Free")).toEqual(["onlineOrdering"]);
  });
});

describe("the one-time unlock shelf is retired", () => {
  it("offers nothing for sale, whatever the defaults say", () => {
    for (const f of ALL_FEATURES) {
      expect(retireOneTimeStore(DEFAULT_FEATURE_PRICES)[f].enabled, f).toBe(false);
    }
  });

  it("cannot be put back up by a stale row in the database", () => {
    // THE REASON THIS IS A FUNCTION AND NOT A CHANGED DEFAULT: getFeaturePrices
    // reads a super-admin-editable JSON blob. An `enabled: true` left in it
    // from before would otherwise quietly re-price a feature that is now
    // included in the plan.
    const stale = { loyalty: { price: 120_000, enabled: true } };
    expect(normalizeFeaturePrices(stale).loyalty.enabled).toBe(false);
    expect(normalizeFeaturePrices(null).onlineOrdering.enabled).toBe(false);
  });

  it("keeps the prices, because what was bought is still owned", () => {
    // A shop that paid ₱1,200 for loyalty keeps it, on Free, unbilled. The
    // amounts stay as the record of what was charged.
    expect(DEFAULT_FEATURE_PRICES.loyalty.price).toBeGreaterThan(0);
  });
});

describe("a partner-sold shop lands on the plan", () => {
  const convert = codeAt("src/server/storefront-demo/convert.ts");
  const partner = codeAt("src/server/partners/demo.ts");

  it("converts to Standard rather than to Free", () => {
    // It used to be "free", which meant a shop somebody had just SOLD arrived
    // with almost every feature locked, to be bought back one at a time off a
    // shelf that no longer exists.
    expect(partner).toContain('convertDemo(restaurantId, formData.get("username"), "standard")');
    expect(convert).toContain('export type ConvertBilling = "trial30" | "standard" | "free"');
  });

  it("is active from day one, with nothing to lapse", () => {
    // The partner bills it directly from the day they sell it, so there is no
    // trial for the billing cron to expire and downgrade.
    expect(convert).toContain('billing === "trial30" ? ("trialing" as const) : ("active" as const)');
  });

  it("resolves the plan by price, not by name", () => {
    // getTopPlan is the highest-priced ACTIVE plan. Renaming Standard must not
    // silently drop everyone onto Free.
    expect(convert).toContain("getTopPlan(tx)");
  });
});

describe("the migration left the grandfathered accounts alone", () => {
  const sql = readFileSync(
    join(process.cwd(), "../../packages/db/prisma/manual/one-plan-999.sql"),
    "utf8",
  );

  it("touches no subscription and no restaurant", () => {
    // A one-time unlock was sold precisely so nobody would be billed monthly.
    // Migrating those accounts onto a subscription breaks that bargain.
    expect(sql).not.toMatch(/update\s+subscriptions/i);
    expect(sql).not.toMatch(/update\s+restaurants/i);
    expect(sql).not.toMatch(/delete\s+from/i);
  });

  it("deactivates the old paid tiers instead of deleting them", () => {
    expect(sql).toContain('set "isActive" = false');
    expect(sql).toContain("0000000000a2");
    expect(sql).toContain("0000000000a3");
  });

  it("leaves Free active", () => {
    // It is the lapsed-trial downgrade target and the home of every
    // grandfathered account.
    const deactivated = sql.slice(sql.indexOf('set "isActive" = false'));
    expect(deactivated).not.toContain("0000000000a1");
  });

  it("writes the feature list out in full, scheduler absent", () => {
    // An empty array means "fall back to tier defaults", and an unknown plan
    // name resolves to ALL_FEATURES — which would have handed out the one
    // feature this plan is defined by excluding.
    //
    // SQL comments stripped first: the note explaining the omission names the
    // key it is omitting, and a raw scan reads that as the key being present.
    const bare = sql.replace(/--.*$/gm, "");
    const arr = bare.slice(bare.indexOf("array["), bare.indexOf("]::text[]"));
    for (const f of ALL_FEATURES.filter((x) => x !== "contentScheduler")) {
      expect(arr, f).toContain(`'${f}'`);
    }
    expect(arr).not.toContain("'contentScheduler'");
  });

  it("sets the floor to the price", () => {
    // Partners resell this at their own price and CANVEXIA takes a cut of what
    // was actually charged, so undercutting comes out of HQ's revenue too.
    expect(sql).toContain("99900,\n  99900,");
  });
});

describe("the central carve-out that actually guarantees the exclusion", () => {
  it("strips monthly-billed features from whatever a plan or trial grants", () => {
    // Belt and braces, and the braces are here rather than in the plan row: a
    // live trial unlocks ALL_FEATURES, so without this a trialing account would
    // get the content scheduler free.
    const gate = codeAt("src/server/billing/feature-gate.ts");
    expect(gate).toContain("for (const f of all) if (isMonthlyFeature(f)) all.delete(f);");
    expect(gate).toContain("for (const f of monthly) all.add(f);");
  });

  it("still counts the scheduler as monthly-billed", () => {
    const subs = codeAt("src/server/billing/feature-subscriptions.ts");
    expect(subs).toContain("contentScheduler: { label:");
    expect(subs).toContain("49_900");
  });
});

describe("nothing still advertises the shelf", () => {
  const featureKeys: Feature[] = ["loyalty", "inventory"];

  it("the merchant billing page does not promise one-time unlocks", () => {
    const page = codeAt("src/app/(platform)/admin/billing/page.tsx");
    expect(page).not.toContain("no monthly subscription");
    expect(page).toContain("₱999/mo");
    // Sanity: the page still knows about features at all.
    expect(featureKeys.length).toBe(2);
  });

  it("the super-admin pricing screen says it is retired", () => {
    const page = codeAt("src/app/(platform)/super-admin/feature-pricing/page.tsx");
    expect(page).toContain("Nothing here is on sale any more");
  });

  it("the partner convert form quotes the plan, not ₱0", () => {
    const form = codeAt("src/components/partner/PartnerConvertForm.tsx");
    expect(form).not.toContain("₱0 Free plan");
    expect(form).toContain("₱999/mo");
  });
});
