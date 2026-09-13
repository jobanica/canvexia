import { describe, it, expect } from "vitest";
import { buildBatchPlan, planRatio } from "@/lib/content/batch";
import { withinCap, remainingToday } from "@/lib/content/limits";

const jabPillars = [
  { id: "j1", name: "Money Math" },
  { id: "j2", name: "Operations" },
  { id: "j3", name: "Menu Psych" },
];
const hookPillars = [
  { id: "h1", name: "Demo" },
  { id: "h2", name: "Offer" },
];

describe("buildBatchPlan — J-J-J-H sequencing", () => {
  it("produces the configured 3:1 ratio", () => {
    const plan = buildBatchPlan({ totalCount: 8, jabRatio: 3, jabPillars, hookPillars });
    const { jabs, hooks } = planRatio(plan);
    expect(jabs).toBe(6);
    expect(hooks).toBe(2);
    // pattern: J J J H J J J H
    expect(plan.map((p) => p.type)).toEqual([
      "JAB", "JAB", "JAB", "RIGHT_HOOK", "JAB", "JAB", "JAB", "RIGHT_HOOK",
    ]);
  });

  it("honours a different ratio (2:1)", () => {
    const plan = buildBatchPlan({ totalCount: 6, jabRatio: 2, jabPillars, hookPillars });
    expect(plan.map((p) => p.type)).toEqual([
      "JAB", "JAB", "RIGHT_HOOK", "JAB", "JAB", "RIGHT_HOOK",
    ]);
  });

  it("round-robins pillars across each kind", () => {
    const plan = buildBatchPlan({ totalCount: 8, jabRatio: 3, jabPillars, hookPillars });
    const jabNames = plan.filter((p) => p.type === "JAB").map((p) => p.pillarName);
    // 6 jabs over 3 pillars → each used twice, in order
    expect(jabNames).toEqual([
      "Money Math", "Operations", "Menu Psych", "Money Math", "Operations", "Menu Psych",
    ]);
    const hookNames = plan.filter((p) => p.type === "RIGHT_HOOK").map((p) => p.pillarName);
    expect(hookNames).toEqual(["Demo", "Offer"]);
  });

  it("schedules one post per day by default", () => {
    const plan = buildBatchPlan({ totalCount: 4, jabRatio: 3, jabPillars, hookPillars });
    expect(plan.map((p) => p.dayOffset)).toEqual([0, 1, 2, 3]);
  });

  it("respects a custom cadence", () => {
    const plan = buildBatchPlan({ totalCount: 3, jabRatio: 3, jabPillars, hookPillars, cadenceDays: 2 });
    expect(plan.map((p) => p.dayOffset)).toEqual([0, 2, 4]);
  });

  it("falls back to a null pillar when none are available", () => {
    const plan = buildBatchPlan({ totalCount: 2, jabRatio: 1, jabPillars: [], hookPillars: [] });
    expect(plan[0]).toMatchObject({ type: "JAB", pillarId: null });
    expect(plan[1]).toMatchObject({ type: "RIGHT_HOOK", pillarId: null });
  });
});

describe("daily cap math", () => {
  it("allows a batch that fits", () => {
    expect(withinCap(10, 8, 50)).toBe(true);
  });
  it("rejects a batch that would exceed the cap", () => {
    expect(withinCap(45, 8, 50)).toBe(false);
  });
  it("reports remaining headroom (never negative)", () => {
    expect(remainingToday(45, 50)).toBe(5);
    expect(remainingToday(60, 50)).toBe(0);
  });
});
