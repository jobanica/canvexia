import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildScorecard,
  leaderboard,
  previousMonthKey,
  recentMonths,
  type StaffFacts,
} from "@/lib/partners/scorecard";

/**
 * A7.5: the scorecard's judgements.
 *
 * Three of them are arguable and all three are about what to do when a
 * denominator is zero — which is the ordinary case for a new salesperson in
 * their first fortnight, not an edge case.
 */

const facts = (over: Partial<StaffFacts> = {}): StaffFacts => ({
  partnerUserId: "u1",
  name: "Ana",
  visits: 0,
  demos: 0,
  trials: 0,
  conversions: 0,
  activeMerchants: 0,
  churnedMerchants: 0,
  target: null,
  ...over,
});

describe("conversion rate", () => {
  it("is NULL with no demos, not zero", () => {
    // THE JUDGEMENT. 0% says they tried and failed; null says there was nothing
    // to convert. Those are different claims about somebody's work, and the
    // first one is wrong about a person in their first week.
    const [row] = buildScorecard([facts({ visits: 12, demos: 0, conversions: 0 })]);
    expect(row.conversionRate).toBeNull();
  });

  it("is conversions over DEMOS, not over visits", () => {
    // A visit where the owner was out is not a chance that was missed.
    // Counting it would make this a measure of how often people are in.
    const [row] = buildScorecard([facts({ visits: 40, demos: 10, conversions: 3 })]);
    expect(row.conversionRate).toBeCloseTo(0.3, 6);
  });

  it("can exceed nothing and cannot exceed one in practice", () => {
    const [row] = buildScorecard([facts({ demos: 4, conversions: 4 })]);
    expect(row.conversionRate).toBe(1);
  });
});

describe("progress against target", () => {
  it("is null when no target was set", () => {
    const [row] = buildScorecard([facts({ visits: 30 })]);
    expect(row.progress).toBeNull();
    expect(row.onTarget).toBe(false);
  });

  it("caps at 1 so an overachiever does not render off the end of the bar", () => {
    const [row] = buildScorecard([
      facts({ visits: 90, demos: 20, conversions: 9, target: { visits: 30, demos: 10, merchants: 3 } }),
    ]);
    expect(row.progress).toEqual({ visits: 1, demos: 1, merchants: 1 });
    expect(row.onTarget).toBe(true);
  });

  it("treats a target of zero as met rather than dividing by zero", () => {
    // "No visits expected this month" is a target met by doing nothing. The
    // alternative is a row showing 0% forever for a line nobody was asked to
    // hit.
    const [row] = buildScorecard([
      facts({ target: { visits: 0, demos: 0, merchants: 0 } }),
    ]);
    expect(row.progress).toEqual({ visits: 1, demos: 1, merchants: 1 });
    expect(row.onTarget).toBe(true);
  });

  it("is not on target when one line of three is short", () => {
    const [row] = buildScorecard([
      facts({ visits: 30, demos: 10, conversions: 1, target: { visits: 30, demos: 10, merchants: 3 } }),
    ]);
    expect(row.onTarget).toBe(false);
    expect(row.progress!.merchants).toBeCloseTo(1 / 3, 6);
  });

  it("measures the merchants line against CONVERSIONS, not merchants owned", () => {
    // A target of "three new merchants" is about the month's work. Measuring it
    // against the book somebody already carries would mark a veteran as on
    // target in a month they did nothing.
    const [row] = buildScorecard([
      facts({
        conversions: 0,
        activeMerchants: 40,
        target: { visits: 0, demos: 0, merchants: 3 },
      }),
    ]);
    expect(row.progress!.merchants).toBe(0);
    expect(row.onTarget).toBe(false);
  });
});

describe("the leaderboard", () => {
  it("ranks by what was closed, not by conversion rate", () => {
    // One demo and one conversion is 100%. A board that puts that above
    // somebody who ran forty demos and closed twelve rewards not trying.
    const rows = buildScorecard([
      facts({ partnerUserId: "a", name: "Perfect", demos: 1, conversions: 1 }),
      facts({ partnerUserId: "b", name: "Busy", demos: 40, conversions: 12 }),
    ]);
    expect(leaderboard(rows).map((r) => r.name)).toEqual(["Busy", "Perfect"]);
  });

  it("breaks ties by demos, then visits, then name", () => {
    const rows = buildScorecard([
      facts({ partnerUserId: "c", name: "Carla", conversions: 2, demos: 5, visits: 9 }),
      facts({ partnerUserId: "a", name: "Ana", conversions: 2, demos: 5, visits: 9 }),
      facts({ partnerUserId: "b", name: "Bea", conversions: 2, demos: 8, visits: 1 }),
    ]);
    expect(leaderboard(rows).map((r) => r.name)).toEqual(["Bea", "Ana", "Carla"]);
  });
});

describe("month keys", () => {
  it("steps back across a year boundary", () => {
    expect(previousMonthKey("2026-01")).toBe("2025-12");
    expect(previousMonthKey("2026-10")).toBe("2026-09");
  });

  it("pads single-digit months so the keys sort", () => {
    // "2026-9" sorts after "2026-10" as a string, which is how a month picker
    // ends up in the wrong order.
    expect(previousMonthKey("2026-10")).toBe("2026-09");
    expect(recentMonths("2026-02", 3)).toEqual(["2026-02", "2026-01", "2025-12"]);
  });
});

describe("the screen enforces the scope in the QUERY", () => {
  const page = readFileSync(
    join(process.cwd(), "src/app/(platform)/partner/team/scorecard/page.tsx"),
    "utf8",
  );

  it("filters to one seat when it lacks hr.view_all", () => {
    // Not by hiding rows the server already sent — those are in the payload.
    expect(page).toContain("onlyUserId: seesEveryone ? undefined :");
  });

  it("never falls back to an empty filter for a seatless login", () => {
    // `?? "none"` rather than `?? undefined`: undefined would widen the query
    // to everybody, which is the opposite of what a missing seat should mean.
    expect(page).toContain('partner.user.id ?? "none"');
  });
});
