import { describe, it, expect } from "vitest";
import { planRefund, refundableRemaining, type RefundableLine } from "@/lib/orders/refund";

/**
 * The case this exists for, in the owner's words: a customer paid up front, then
 * one of their dishes couldn't be made because the kitchen ran out. Voiding
 * refuses a paid order — correctly, since voiding pretends a sale never
 * happened and this one did — so there was nothing to do but hand cash over and
 * let the books disagree with the drawer.
 */

const line = (id: string, lineTotal: number, quantity = 1, refundedQty = 0): RefundableLine => ({
  id,
  lineTotal,
  quantity,
  refundedQty,
});

// Chicken ₱300, iced tea ₱100, burger ₱600. Ticket ₱1,000, paid in full.
const TICKET = [line("chicken", 30_000), line("tea", 10_000), line("burger", 60_000)];

describe("refunding one item", () => {
  it("hands back that item's share and nothing else", () => {
    const p = planRefund(TICKET, [{ lineId: "chicken", quantity: 1 }], 100_000);
    expect(p.error).toBeNull();
    expect(p.amount).toBe(30_000);
  });

  it("can refund several at once", () => {
    const p = planRefund(
      TICKET,
      [{ lineId: "chicken", quantity: 1 }, { lineId: "tea", quantity: 1 }],
      100_000,
    );
    expect(p.amount).toBe(40_000);
  });

  it("refunds part of a multiple line", () => {
    const three = [line("tea", 30_000, 3)];
    const p = planRefund(three, [{ lineId: "tea", quantity: 2 }], 30_000);
    expect(p.amount).toBe(20_000);
  });
});

/**
 * The reason this isn't just "hand back the menu price". A ₱1,000 ticket
 * settled at ₱800 after a senior discount that refunds a ₱300 dish at face
 * value has given back more of the customer's money than they paid for it, and
 * the drawer ends the day short.
 */
describe("a discounted ticket", () => {
  it("refunds a share of what was collected, not the menu price", () => {
    // 20% off: ₱1,000 of food, ₱800 taken. The chicken is 30% of the ticket.
    const p = planRefund(TICKET, [{ lineId: "chicken", quantity: 1 }], 80_000);
    expect(p.amount).toBe(24_000);
  });

  it("gives the whole ticket back when every line goes back", () => {
    const p = planRefund(
      TICKET,
      [
        { lineId: "chicken", quantity: 1 },
        { lineId: "tea", quantity: 1 },
        { lineId: "burger", quantity: 1 },
      ],
      80_000,
    );
    expect(p.amount).toBe(80_000);
  });

  // A card fee makes collected LARGER than the food. The share still holds.
  it("handles a ticket that collected more than the food came to", () => {
    const p = planRefund(TICKET, [{ lineId: "chicken", quantity: 1 }], 103_500);
    expect(p.amount).toBe(31_050);
  });
});

describe("what it refuses to do", () => {
  it("never hands back more than was taken", () => {
    const p = planRefund(TICKET, [{ lineId: "burger", quantity: 1 }], 100_000, 95_000);
    expect(p.amount).toBeLessThanOrEqual(5_000);
  });

  it("stops once everything has been given back", () => {
    const p = planRefund(TICKET, [{ lineId: "tea", quantity: 1 }], 100_000, 100_000);
    expect(p.error).toMatch(/already been refunded/i);
    expect(p.amount).toBe(0);
  });

  it("won't refund the same item twice", () => {
    const used = [line("chicken", 30_000, 1, 1), line("tea", 10_000)];
    const p = planRefund(used, [{ lineId: "chicken", quantity: 1 }], 40_000);
    expect(p.error).toMatch(/already been refunded/i);
  });

  it("won't refund more of a line than was ordered", () => {
    const three = [line("tea", 30_000, 3)];
    const p = planRefund(three, [{ lineId: "tea", quantity: 4 }], 30_000);
    expect(p.error).toMatch(/Only 3/);
  });

  it("counts what's already gone back on that line", () => {
    const three = [line("tea", 30_000, 3, 2)];
    const p = planRefund(three, [{ lineId: "tea", quantity: 2 }], 30_000);
    expect(p.error).toMatch(/Only 1/);
  });

  it("asks for something to be picked", () => {
    expect(planRefund(TICKET, [], 100_000).error).toMatch(/at least one/i);
    expect(planRefund(TICKET, [{ lineId: "tea", quantity: 0 }], 100_000).error).toMatch(/at least one/i);
  });

  it("rejects a line that isn't on the ticket", () => {
    expect(planRefund(TICKET, [{ lineId: "ghost", quantity: 1 }], 100_000).error).toMatch(/isn't on this ticket/i);
  });

  it("has nothing to give back on a ₱0 ticket", () => {
    expect(planRefund([line("free", 0)], [{ lineId: "free", quantity: 1 }], 0).error).toBeTruthy();
  });
});

describe("rounding", () => {
  // Three equal lines on a ticket that doesn't divide evenly.
  it("never lets the parts add up to more than the whole", () => {
    const thirds = [line("a", 10_000), line("b", 10_000), line("c", 10_000)];
    const p = planRefund(
      thirds,
      [
        { lineId: "a", quantity: 1 },
        { lineId: "b", quantity: 1 },
        { lineId: "c", quantity: 1 },
      ],
      10_001,
    );
    expect(p.amount).toBeLessThanOrEqual(10_001);
    expect(p.lines.reduce((s, l) => s + l.amount, 0)).toBe(p.amount);
  });

  it("still adds up after being trimmed to the cap", () => {
    const p = planRefund(TICKET, [{ lineId: "burger", quantity: 1 }], 100_000, 98_000);
    expect(p.lines.reduce((s, l) => s + l.amount, 0)).toBe(p.amount);
    expect(p.amount).toBe(2_000);
  });
});

describe("refundableRemaining", () => {
  it("is what's left of what was taken", () => {
    expect(refundableRemaining(100_000, 30_000)).toBe(70_000);
  });

  it("never goes negative", () => {
    expect(refundableRemaining(100_000, 150_000)).toBe(0);
    expect(refundableRemaining(0, 0)).toBe(0);
  });
});
