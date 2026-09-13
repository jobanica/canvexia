import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MODULE_FOR_FEATURE } from "@/server/billing/entitlements";
import { ALL_FEATURES, isFeature, type Feature } from "@/lib/billing/features";
import { isMonthlyFeature } from "@/server/billing/feature-subscriptions";
import { addonKeyFor, featureForAddonKey } from "@/server/billing/owned-features";

/**
 * A shop that had bought HR outright saw "Owned — paid once, kept forever" on
 * the billing page and the buy-it-now paywall on every HR page.
 *
 * The store read their PURCHASES; the gate read only their PLAN. getEntitlements
 * built its module set from getPlanAccess, which answers "what does their plan
 * include" and knows nothing about one-time unlocks — so every module-gated page
 * in the app (HR, Inventory, custom domain) ignored anything bought outright.
 */

const MODULE_FEATURES = Object.values(MODULE_FOR_FEATURE) as Feature[];

describe("the module → feature mapping", () => {
  it("maps every module to a real feature", () => {
    for (const f of MODULE_FEATURES) {
      expect(isFeature(f), `${f} is not a known feature`).toBe(true);
      expect(ALL_FEATURES).toContain(f);
    }
  });

  it("covers the three that are actually gated", () => {
    expect(MODULE_FOR_FEATURE.hris).toBe("hr");
    expect(MODULE_FOR_FEATURE.inventory).toBe("inventory");
    expect(MODULE_FOR_FEATURE.custom_domain).toBe("customDomain");
  });

  /**
   * getEntitledFeatures deletes every monthly feature before re-adding only the
   * ones with a live subscription. A module that became monthly would therefore
   * be stripped from the set the gate reads — revoking something a shop had
   * already paid for outright.
   */
  it("has no module billed as a monthly subscription", () => {
    for (const f of MODULE_FEATURES) {
      expect(isMonthlyFeature(f), `${f} is gated as a module AND billed monthly`).toBe(false);
    }
  });

  // If it can be bought, the gate has to read purchases — which is the fix.
  it("round-trips through the addon key each purchase is stored under", () => {
    for (const f of MODULE_FEATURES) {
      expect(featureForAddonKey(addonKeyFor(f))).toBe(f);
    }
  });

  // customDomain shipped first under the snake_case module name; existing paid
  // rows still carry it, and must not stop working.
  it("keeps the legacy custom_domain addon key", () => {
    expect(addonKeyFor("customDomain")).toBe("custom_domain");
    expect(featureForAddonKey("custom_domain")).toBe("customDomain");
  });
});

/**
 * The regression itself. getEntitlements has to resolve modules from the set
 * that folds in one-time purchases, not from the plan alone — reading the source
 * because the function needs a database and the mistake is a one-word one.
 */
describe("getEntitlements reads the right set", () => {
  const src = readFileSync(join(process.cwd(), "src/server/billing/entitlements.ts"), "utf8");
  const body = src.slice(src.indexOf("export async function getEntitlements"));

  it("builds its modules from the entitled features, purchases included", () => {
    expect(body).toContain("getEntitledFeatures");
    // The loop must test the entitled set, never the raw plan set.
    expect(body).toMatch(/entitled\.has\(feature\)/);
    expect(body).not.toMatch(/access\.features\.has\(feature\)/);
  });

  // The tier and trial flags still come from the plan — that part was right.
  it("still takes the tier and trial state from the plan", () => {
    expect(body).toContain("getPlanAccess");
    expect(body).toContain("access.onTrial");
  });
});
