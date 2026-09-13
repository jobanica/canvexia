import { describe, it, expect } from "vitest";
import {
  isOnKitchenBoard,
  needsKitchenReopen,
  previousLineIds,
  reopenStatus,
} from "@/lib/orders/extra-round";

/**
 * The reported scenario: table 1 orders, the kitchen marks it ready, the
 * cashier marks it served — so the ticket is off the kitchen display. The
 * customer then orders extra. Before this, those items landed on the bill and
 * nowhere else: the kitchen had to be told by somebody, find the ticket in the
 * history and reopen it by hand.
 */

describe("needsKitchenReopen", () => {
  it("puts a finished ticket back on the board", () => {
    expect(needsKitchenReopen("done")).toBe(true);
  });

  it("leaves a ticket the kitchen is still holding exactly where it is", () => {
    // It's already in front of them; moving its status would shove it back to
    // the start of a queue it never left.
    expect(needsKitchenReopen("new")).toBe(false);
    expect(needsKitchenReopen("preparing")).toBe(false);
  });

  it("never resurrects an order that can't take items anyway", () => {
    for (const status of ["closed", "cancelled", "pending", ""]) {
      expect(needsKitchenReopen(status)).toBe(false);
    }
  });
});

describe("reopenStatus", () => {
  it("comes back as preparing, not new", () => {
    // These people have already waited once. Re-entering as "new" would restart
    // the ticket's clock on the one screen that shows waiting times.
    expect(reopenStatus()).toBe("preparing");
  });
});

describe("isOnKitchenBoard", () => {
  it("matches the statuses the kitchen queue actually shows", () => {
    expect(isOnKitchenBoard("new")).toBe(true);
    expect(isOnKitchenBoard("preparing")).toBe(true);
    expect(isOnKitchenBoard("done")).toBe(false);
    expect(isOnKitchenBoard("closed")).toBe(false);
  });
});

describe("previousLineIds", () => {
  it("returns the lines the kitchen still has to be told it already made", () => {
    const before = [
      { id: "a", preparedAt: null },
      { id: "b", preparedAt: null },
    ];
    expect(previousLineIds(before)).toEqual(["a", "b"]);
  });

  it("skips lines the cook already ticked off", () => {
    const before = [
      { id: "a", preparedAt: new Date("2026-08-21T10:00:00Z") },
      { id: "b", preparedAt: null },
    ];
    expect(previousLineIds(before)).toEqual(["b"]);
  });

  it("accepts an ISO string as well as a Date", () => {
    // The same rows arrive as strings once they've crossed a serialization
    // boundary; a truthy check has to hold either way.
    const before = [
      { id: "a", preparedAt: "2026-08-21T10:00:00.000Z" },
      { id: "b", preparedAt: null },
    ];
    expect(previousLineIds(before)).toEqual(["b"]);
  });

  it("handles a ticket whose lines predate the preparedAt column", () => {
    expect(previousLineIds([{ id: "a" }, { id: "b" }])).toEqual(["a", "b"]);
  });

  it("is empty for an empty ticket", () => {
    expect(previousLineIds([])).toEqual([]);
  });
});
