import { describe, it, expect } from "vitest";
import {
  buildAttention,
  QUIET_DAYS,
  TRIAL_WARNING_DAYS,
  type MerchantFact,
  type ProspectFact,
} from "@/lib/partners/attention";

/**
 * The attention list's rules.
 *
 * Tested at a fixed date because every one of them is a date comparison, and a
 * function that reads its own clock cannot be tested on the day that matters.
 */
const NOW = new Date("2026-06-15T09:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 864e5);

function merchant(over: Partial<MerchantFact> = {}): MerchantFact {
  return {
    id: "m1",
    productId: "servd",
    name: "Mango Grill",
    subscriptionStatus: "active",
    trialEndsAt: null,
    lastOrderAt: day(-1),
    createdAt: day(-90),
    ...over,
  };
}

describe("buildAttention", () => {
  it("is empty when nothing needs doing", () => {
    expect(buildAttention([merchant()], [], NOW)).toEqual([]);
  });

  it("flags a past-due account first", () => {
    const rows = buildAttention([merchant({ subscriptionStatus: "past_due" })], [], NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("past_due");
    expect(rows[0].href).toBe("/partner/merchants/servd:m1");
  });

  it("flags a trial ending within the warning window", () => {
    const soon = buildAttention(
      [merchant({ subscriptionStatus: "trialing", trialEndsAt: day(TRIAL_WARNING_DAYS - 1) })],
      [],
      NOW,
    );
    expect(soon[0].kind).toBe("trial_ending");

    const later = buildAttention(
      [merchant({ subscriptionStatus: "trialing", trialEndsAt: day(TRIAL_WARNING_DAYS + 5) })],
      [],
      NOW,
    );
    expect(later).toEqual([]);
  });

  it("says a lapsed trial has ended rather than counting backwards", () => {
    const rows = buildAttention(
      [merchant({ subscriptionStatus: "trialing", trialEndsAt: day(-3) })],
      [],
      NOW,
    );
    expect(rows[0].detail).toMatch(/has ended/i);
  });

  it("flags a merchant that has gone quiet", () => {
    const rows = buildAttention([merchant({ lastOrderAt: day(-QUIET_DAYS) })], [], NOW);
    expect(rows[0].kind).toBe("quiet");
    expect(rows[0].detail).toBe(`No orders in ${QUIET_DAYS} days.`);
  });

  it("does NOT call a merchant that has never traded 'quiet'", () => {
    // A shop opened yesterday with no orders is new, not quiet. Telling a
    // partner otherwise trains them to ignore this list.
    expect(buildAttention([merchant({ lastOrderAt: null, createdAt: day(-1) })], [], NOW)).toEqual([]);
    // And still not, months later — "never onboarded" is a different problem
    // than "went quiet", and a wrong label sends the partner to the wrong
    // conversation.
    expect(buildAttention([merchant({ lastOrderAt: null, createdAt: day(-200) })], [], NOW)).toEqual([]);
  });

  it("does not nag about a cancelled account being quiet", () => {
    const rows = buildAttention(
      [merchant({ subscriptionStatus: "cancelled", lastOrderAt: day(-60) })],
      [],
      NOW,
    );
    expect(rows).toEqual([]);
  });

  it("flags a follow-up due today and one overdue, not one scheduled ahead", () => {
    const prospects: ProspectFact[] = [
      { id: "p1", businessName: "Today", nextFollowUpAt: day(0) },
      { id: "p2", businessName: "Overdue", nextFollowUpAt: day(-3) },
      { id: "p3", businessName: "Next week", nextFollowUpAt: day(7) },
      { id: "p4", businessName: "Unscheduled", nextFollowUpAt: null },
    ];
    const rows = buildAttention([], prospects, NOW);
    expect(rows.map((r) => r.title)).toEqual(["Overdue", "Today"]);
    expect(rows[0].detail).toBe("Follow-up 3 days overdue.");
    expect(rows[1].detail).toBe("Follow up today.");
  });

  it("puts money first, then anything late, then the rest", () => {
    const rows = buildAttention(
      [
        merchant({ id: "a", name: "Quiet Shop", lastOrderAt: day(-30) }),
        merchant({ id: "b", name: "Broke Shop", subscriptionStatus: "past_due" }),
      ],
      [{ id: "p", businessName: "Late Lead", nextFollowUpAt: day(-2) }],
      NOW,
    );
    expect(rows.map((r) => r.kind)).toEqual(["past_due", "follow_up", "quiet"]);
  });

  it("does not invent a ticket rule", () => {
    // The brief asks for "open tickets awaiting partner reply". There is no
    // ticket system in this repository, and an always-empty section would look
    // like everything is handled.
    const kinds = new Set(
      buildAttention([merchant({ subscriptionStatus: "past_due" })], [], NOW).map((r) => r.kind),
    );
    expect(kinds.has("past_due" as const)).toBe(true);
    expect([...kinds]).not.toContain("ticket");
  });
});
