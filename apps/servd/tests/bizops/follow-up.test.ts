import { describe, it, expect } from "vitest";
import {
  dueFollowUps,
  isSettled,
  suggestedMessage,
  type FollowUpCandidate,
} from "@/lib/bizops/follow-up";

/**
 * The rule this file exists to enforce: never chase somebody who already paid.
 *
 * The brief calls it out as the same discipline as the email suppression list,
 * and it's checked at render time rather than trusted from a stage field —
 * because the payment may have landed since a human last touched the row, which
 * is precisely when a chase message is most damaging.
 */

const NOW = new Date("2026-08-25T09:00:00+08:00");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const lead = (over: Partial<FollowUpCandidate> = {}): FollowUpCandidate => ({
  id: "l1",
  name: "Lola's Kitchen",
  track: "diy_preview",
  since: daysAgo(3),
  dueAt: daysAgo(1),
  step: 0,
  paidAt: null,
  activatedAt: null,
  stage: "in_sequence",
  ...over,
});

describe("isSettled", () => {
  it("settles anyone who paid, whatever the stage says", () => {
    expect(isSettled(lead({ paidAt: daysAgo(1), stage: "in_sequence" }))).toBe(true);
  });

  it("settles anyone activated", () => {
    expect(isSettled(lead({ activatedAt: daysAgo(1) }))).toBe(true);
  });

  it("settles won and lost", () => {
    expect(isSettled(lead({ stage: "won" }))).toBe(true);
    expect(isSettled(lead({ stage: "lost" }))).toBe(true);
  });

  it("leaves a live lead alone", () => {
    expect(isSettled(lead())).toBe(false);
  });
});

describe("dueFollowUps", () => {
  it("drops a paid lead from the chase list", () => {
    const rows = dueFollowUps([lead({ id: "paid", paidAt: daysAgo(2) }), lead({ id: "live" })], NOW);
    expect(rows.map((r) => r.id)).toEqual(["live"]);
  });

  it("includes a lead with nothing scheduled yet", () => {
    // A DIY preview nobody has ever chased has no due date. It is the most
    // overdue thing on the list, not something to leave out of it.
    const rows = dueFollowUps([lead({ dueAt: null })], NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].overdue).toBe(false); // nothing was scheduled, so nothing was missed
  });

  it("leaves out a chase scheduled for later", () => {
    const future = new Date(NOW.getTime() + 3 * 86_400_000).toISOString();
    expect(dueFollowUps([lead({ dueAt: future })], NOW)).toHaveLength(0);
  });

  it("puts the longest-ignored lead first, not the soonest due", () => {
    const rows = dueFollowUps(
      [
        lead({ id: "recent", since: daysAgo(2) }),
        lead({ id: "ancient", since: daysAgo(30) }),
        lead({ id: "middle", since: daysAgo(9) }),
      ],
      NOW,
    );
    expect(rows.map((r) => r.id)).toEqual(["ancient", "middle", "recent"]);
    expect(rows[0].daysSince).toBe(30);
  });

  it("handles a lead with no since date without crashing", () => {
    const rows = dueFollowUps([lead({ since: null })], NOW);
    expect(rows[0].daysSince).toBe(0);
  });
});

describe("suggestedMessage", () => {
  const due = (over: Partial<FollowUpCandidate> = {}) => dueFollowUps([lead(over)], NOW)[0];

  it("escalates rather than repeating itself", () => {
    const first = suggestedMessage(due({ step: 0 }));
    const last = suggestedMessage(due({ step: 3 }));
    expect(first).not.toBe(last);
    // The last one gives them a way out — a fourth chase that reads like the
    // first is what gets an account blocked.
    expect(last).toMatch(/istorbo/);
  });

  it("says something different to a DIY preview than to a cold prospect", () => {
    expect(suggestedMessage(due({ track: "diy_preview", step: 0 }))).toContain("preview");
    expect(suggestedMessage(due({ track: "outreach", step: 0 }))).toContain("Servd");
  });

  it("uses the business name it was given", () => {
    expect(suggestedMessage(due(), "Mang Inasal Toril")).toContain("Mang Inasal Toril");
  });
});
