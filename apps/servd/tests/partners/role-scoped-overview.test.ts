import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { maskAmounts, type PartnerOverview } from "@/server/partners/overview";

/**
 * A7.2: the overview forks four ways, and the money is removed on the SERVER.
 *
 * The test that matters here is the masking one. Hiding a figure in the
 * component leaves it in the serialised props — visible in the page source to
 * exactly the person the rule is about — so "masked" has to mean "never left
 * the server", and that is what these assert.
 */

const overview = (): PartnerOverview =>
  ({
    merchants: [{ id: "m1" }, { id: "m2" }],
    payingCount: 1,
    mrrCentavos: 499_00,
    partnerShareCentavos: 349_30,
    hqShareCentavos: 149_70,
    settlementDirection: "payout",
    milestones: { steps: [], current: null },
    licenseStartedAt: null,
    exclusivityExpiresAt: null,
    attention: [],
    series: [
      { month: "2026-08", merchants: 1, mrrCentavos: 299_00 },
      { month: "2026-09", merchants: 2, mrrCentavos: 499_00 },
    ],
    onboarding: { steps: {}, dismissedAt: null },
  }) as unknown as PartnerOverview;

describe("maskAmounts", () => {
  it("removes every peso figure, including the ones inside the series", () => {
    // The series is the one people forget. A masked headline over a chart whose
    // tooltips still carry the monthly revenue has masked nothing.
    const masked = maskAmounts(overview());
    expect(masked.mrrCentavos).toBe(0);
    expect(masked.partnerShareCentavos).toBe(0);
    expect(masked.hqShareCentavos).toBe(0);
    for (const point of masked.series) expect(point.mrrCentavos, point.month).toBe(0);
  });

  it("keeps the SHAPE, which is what an ops manager is meant to see", () => {
    // The brief: "merchant counts and MRR trend shape but ₱ amounts masked".
    // A mask that also removed the counts would leave the role unable to do the
    // job it exists for.
    const masked = maskAmounts(overview());
    expect(masked.merchants).toHaveLength(2);
    expect(masked.payingCount).toBe(1);
    expect(masked.series.map((p) => p.merchants)).toEqual([1, 2]);
    expect(masked.settlementDirection).toBe("payout");
  });

  it("does not mutate the overview it was given", () => {
    // It is called on the result of a shared fetch. Mutating in place would
    // mask the figures for whoever read that object next.
    const original = overview();
    maskAmounts(original);
    expect(original.mrrCentavos).toBe(499_00);
    expect(original.series[1].mrrCentavos).toBe(499_00);
  });
});

describe("the screens ask for the right permission", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

  it("gates the permission grid on team.permissions, not team.manage", () => {
    // An ops manager holds team.manage. If the grid were gated on that, they
    // could grant themselves the revenue and every other denial in their row
    // would be advisory.
    const page = read("app/(platform)/partner/team/permissions/page.tsx");
    expect(page).toContain('requirePartnerPageWith("team.permissions")');
    expect(page).not.toContain('requirePartnerPageWith("team.manage")');
  });

  it("forks the overview on a PERMISSION, not on a role name", () => {
    // So an operator who grants their salespeople merchants.view_all gets them
    // the partner-wide overview without a code change.
    const page = read("app/(platform)/partner/page.tsx");
    expect(page).toContain('partnerAllows(partner, "merchants.view_all")');
    expect(page).not.toMatch(/user\.role === "sales"/);
  });

  it("masks on the server before the props are built", () => {
    const page = read("app/(platform)/partner/page.tsx");
    expect(page).toContain("maskAmounts(rawOverview)");
    // And tells the component, so it renders "—" rather than a truthful ₱0.
    expect(page).toContain("showAmounts={showAmounts}");
  });

  it("derives the nav from resolved permissions, not the fixed matrix", () => {
    // The nav moved out of PortalShell into portal-nav so the field app could
    // render the same list; the rule it has to keep travels with it.
    const nav = read("components/partner/portal-nav.tsx");
    expect(nav).toContain("partner.permissions.has(i.need)");
    // The old call would answer from a matrix a partner admin cannot edit, so
    // a link could survive a permission being turned off.
    expect(nav).not.toContain("can(partner.user.role");
  });
});
