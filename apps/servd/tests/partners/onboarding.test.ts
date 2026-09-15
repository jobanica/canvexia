import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { onboardingChecklist, type PartnerOverview } from "@/server/partners/overview";

/**
 * The onboarding checklist, and the reason it could never be finished.
 *
 * `partners.onboardingSteps` was read in three places and written in none, so
 * "Finish the training" and "Book your HQ kickoff call" were permanently
 * unticked and the card could not reach 6 of 6. Four of the six steps are
 * derived from real state and always worked; these tests pin the split, because
 * the temptation when this is next touched is to make the derived ones
 * self-assertable too, and a checklist a partner can tick without doing
 * anything says "done" when nothing happened.
 */

const overview = (steps: Record<string, boolean>, merchants = 0): PartnerOverview =>
  ({
    merchants: Array.from({ length: merchants }, (_, i) => ({ id: `m${i}` })),
    onboarding: { steps, dismissedAt: null },
  }) as unknown as PartnerOverview;

const NOTHING = { slug: null, brandConfig: null, payoutMethod: null };

describe("onboardingChecklist", () => {
  it("has six steps, and none are done for a brand-new partner", () => {
    const steps = onboardingChecklist(overview({}), NOTHING);
    expect(steps).toHaveLength(6);
    expect(steps.filter((s) => s.done)).toHaveLength(0);
  });

  it("ticks the two stored steps from onboardingSteps", () => {
    // The bug, stated as an assertion: this is the only input that can tick
    // these two, so if nothing writes that column they are unreachable.
    const steps = onboardingChecklist(overview({ training: true, kickoff: true }), NOTHING);
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s.done]));
    expect(byKey.training).toBe(true);
    expect(byKey.kickoff).toBe(true);
  });

  it("reaches six of six once everything is done", () => {
    const steps = onboardingChecklist(
      overview({ training: true, kickoff: true }, 1),
      { slug: "davao", brandConfig: { primary: "#000" }, payoutMethod: "gcash" },
    );
    expect(steps.every((s) => s.done)).toBe(true);
  });

  it("marks exactly the two unobservable steps as self-asserted", () => {
    const steps = onboardingChecklist(overview({}), NOTHING);
    const asserted = steps.filter((s) => s.selfAsserted).map((s) => s.key);
    // Not the derived four. A tick control on "Add payout details" would either
    // lie about an empty column or need a second source of truth for one fact.
    expect(asserted).toEqual(["training", "kickoff"]);
  });

  it("points the kickoff step at HQ's calendar when one is configured", () => {
    const withUrl = onboardingChecklist(overview({}), NOTHING, "https://example.test/book");
    const kickoff = withUrl.find((s) => s.key === "kickoff");
    expect(kickoff?.href).toBe("https://example.test/book");
    expect(kickoff?.external).toBe(true);

    // And renders as plain text rather than a dead link when none is set.
    const without = onboardingChecklist(overview({}), NOTHING);
    expect(without.find((s) => s.key === "kickoff")?.href).toBeUndefined();
  });
});

describe("something actually writes onboardingSteps", () => {
  it("the column has a writer, not just three readers", () => {
    // THE DRIFT GUARD. The bug was not a wrong value — it was a field that
    // nothing set, which no type error and no unit test on the reader could
    // catch. This fails if that writer is ever removed.
    const src = readFileSync(
      join(process.cwd(), "src/server/partners/onboarding-actions.ts"),
      "utf8",
    );
    expect(src).toContain("onboardingSteps");
    expect(src).toContain("dismissedAt");
    // Same rule as every other partner action: not reachable by an HQ
    // read-only session.
    expect(src).toContain("requireWritablePartner");
  });
});
