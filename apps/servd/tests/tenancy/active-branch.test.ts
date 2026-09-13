import { describe, it, expect } from "vitest";
import { pickBranch, canSwitchTo, type Membership } from "@/lib/tenancy/active-branch";

/**
 * Which shop the dashboard is showing.
 *
 * Getting this wrong is not a cosmetic bug: it serves one branch's orders,
 * takings and customer data under another branch's name. So the requested
 * branch is honoured only when the login is genuinely a member of it — the
 * value arrives in a cookie, which means it comes from the browser and is a
 * request, never a fact.
 *
 * And only a LIVE branch can be entered. An unactivated one has no online
 * ordering and nothing to run, so landing in it shows a dashboard that can't
 * do anything — which reads as a broken app rather than an unpaid branch.
 */

const m = (restaurantId: string, createdAt: string, active = true): Membership => ({
  restaurantId,
  createdAt,
  active,
});

const A = m("branch-a", "2026-01-01T00:00:00.000Z");
const B = m("branch-b", "2026-06-01T00:00:00.000Z");
const C = m("branch-c", "2026-08-01T00:00:00.000Z");

describe("pickBranch", () => {
  it("honours a live branch the login belongs to", () => {
    expect(pickBranch([A, B, C], "branch-b")).toBe("branch-b");
  });

  it("REFUSES a branch the login doesn't belong to", () => {
    // A forged cookie must not become access to somebody else's restaurant.
    expect(pickBranch([A, B], "someone-elses-restaurant")).toBe("branch-a");
  });

  it("REFUSES a branch that hasn't been activated", () => {
    // The whole point: an unpaid branch isn't somewhere you can work.
    const unpaid = m("branch-new", "2026-09-01T00:00:00.000Z", false);
    expect(pickBranch([A, unpaid], "branch-new")).toBe("branch-a");
  });

  it("defaults to the oldest LIVE branch, skipping unactivated ones", () => {
    const unpaidOldest = m("branch-old", "2025-01-01T00:00:00.000Z", false);
    expect(pickBranch([unpaidOldest, B, C], null)).toBe("branch-b");
  });

  it("still lets a brand-new account in when NOTHING is live yet", () => {
    // Their first restaurant is unactivated — they have to be able to open the
    // dashboard to pay for it. Locking them out would be unrecoverable.
    const first = m("branch-first", "2026-01-01T00:00:00.000Z", false);
    const second = m("branch-second", "2026-02-01T00:00:00.000Z", false);
    expect(pickBranch([first, second], null)).toBe("branch-first");
    expect(pickBranch([second, first], null)).toBe("branch-first");
  });

  it("keeps the default stable when a branch is added", () => {
    // Adding a shop must not silently move an owner into a different one.
    const before = pickBranch([A, B], null);
    const after = pickBranch([A, B, C], null);
    expect(after).toBe(before);
  });

  it("breaks a same-timestamp tie deterministically", () => {
    // Two branches created in the same transaction would otherwise flip
    // between requests depending on row order.
    const x = m("zzz", "2026-01-01T00:00:00.000Z");
    const y = m("aaa", "2026-01-01T00:00:00.000Z");
    expect(pickBranch([x, y], null)).toBe("aaa");
    expect(pickBranch([y, x], null)).toBe("aaa");
  });

  it("is null when the login is staff nowhere", () => {
    expect(pickBranch([], "branch-a")).toBeNull();
  });

  it("leaves a single-branch account exactly as it was", () => {
    expect(pickBranch([A], null)).toBe("branch-a");
    expect(pickBranch([A], "branch-a")).toBe("branch-a");
    // Even a stale cookie from a branch they've been removed from.
    expect(pickBranch([A], "branch-b")).toBe("branch-a");
  });

  it("doesn't mutate the caller's list while sorting", () => {
    const list = [C, A, B];
    pickBranch(list, null);
    expect(list.map((x) => x.restaurantId)).toEqual(["branch-c", "branch-a", "branch-b"]);
  });
});

describe("canSwitchTo", () => {
  it("allows a live branch they belong to", () => {
    expect(canSwitchTo([A, B], "branch-b")).toBe(true);
  });

  it("refuses an unactivated branch", () => {
    const unpaid = m("branch-new", "2026-09-01T00:00:00.000Z", false);
    expect(canSwitchTo([A, unpaid], "branch-new")).toBe(false);
  });

  it("refuses a branch they don't belong to", () => {
    expect(canSwitchTo([A], "branch-b")).toBe(false);
    expect(canSwitchTo([], "branch-a")).toBe(false);
  });
});
