import { describe, it, expect } from "vitest";
import { tableQuota, FREE_TABLE_QRS } from "@/lib/billing/table-quota";

/**
 * This rule decides whether a restaurant can put another QR code on a table, so
 * the two ways of getting it wrong are both expensive: charging someone who was
 * promised unlimited, or giving it away.
 */

const q = (over: Partial<Parameters<typeof tableQuota>[0]> = {}) =>
  tableQuota({ tableCount: 0, grandfathered: false, unlocked: false, ...over });

describe("the free allowance", () => {
  it("gives a brand-new account one table QR", () => {
    const r = q();
    expect(r.canCreate).toBe(true);
    expect(r.remaining).toBe(FREE_TABLE_QRS);
    expect(r.unlimited).toBe(false);
  });

  it("stops at the allowance", () => {
    const r = q({ tableCount: 1 });
    expect(r.canCreate).toBe(false);
    expect(r.remaining).toBe(0);
  });
});

describe("grandfathering", () => {
  // The promise: nobody who already built their floor plan on unlimited QRs
  // loses them, however many they have.
  it("leaves an existing account unlimited", () => {
    const r = q({ grandfathered: true, tableCount: 40 });
    expect(r.unlimited).toBe(true);
    expect(r.canCreate).toBe(true);
    expect(r.reason).toBe("grandfathered");
  });

  it("applies before anything else, so it can't be undone by a lapsed plan", () => {
    expect(q({ grandfathered: true, unlocked: false, tableCount: 99 }).canCreate).toBe(true);
  });
});

describe("the one-time unlock", () => {
  it("makes it unlimited", () => {
    const r = q({ unlocked: true, tableCount: 12 });
    expect(r.unlimited).toBe(true);
    expect(r.reason).toBe("purchased");
  });

  // They bought it, they didn't rent it.
  it("survives however many they go on to create", () => {
    expect(q({ unlocked: true, tableCount: 500 }).canCreate).toBe(true);
  });
});

describe("an account already over the limit", () => {
  // Can happen to anyone created in the window between deploying this and
  // running the migration. They keep every code they printed.
  it("can't add more, but nothing is taken away", () => {
    const r = q({ tableCount: 5 });
    expect(r.canCreate).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("never reports a negative allowance", () => {
    expect(q({ tableCount: 100 }).remaining).toBe(0);
    expect(q({ tableCount: -3 }).remaining).toBe(FREE_TABLE_QRS);
  });
});

describe("the allowance itself", () => {
  it("is the one free QR that was asked for", () => {
    expect(FREE_TABLE_QRS).toBe(1);
  });
});
