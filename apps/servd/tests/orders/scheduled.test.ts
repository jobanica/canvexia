import { describe, it, expect } from "vitest";
import { isForAnotherDay, scheduledLabel, scheduledTicketLabel } from "@/lib/orders/scheduled";
import { buildTicket, ticketBodyLines, ticketLines, WIDTH, type TicketSource } from "@/lib/printing/ticket";

/**
 * An advance order that doesn't say when it's for is a ticket that says "cook
 * this now". The date used to survive only as far as the cashier's incoming
 * popup: accept the order and it vanished from every screen and never reached
 * the kitchen docket at all.
 */

// 22 Aug 2026, 6:30 PM Manila = 10:30 UTC.
const SAT_EVENING = "2026-08-22T10:30:00.000Z";

describe("the label", () => {
  it("always names the day, not just the time", () => {
    const out = scheduledLabel(SAT_EVENING)!;
    expect(out).toContain("Sat");
    expect(out).toContain("Aug");
    expect(out).toContain("22");
    expect(out).toContain("6:30");
  });

  it("reads the moment in Manila, not UTC", () => {
    // 00:30 Manila on the 23rd is 16:30 UTC on the 22nd — a UTC reading would
    // put this on Saturday and the kitchen would be a day out.
    expect(scheduledLabel("2026-08-22T16:30:00.000Z")).toContain("Sun");
  });

  it("says nothing for an order that isn't scheduled", () => {
    expect(scheduledLabel(null)).toBeNull();
    expect(scheduledLabel(undefined)).toBeNull();
    expect(scheduledLabel("not a date")).toBeNull();
  });

  it("fits the printed line on 32-column paper", () => {
    expect(`Scheduled for: ${scheduledTicketLabel(SAT_EVENING)}`.length).toBeLessThanOrEqual(WIDTH + 8);
    expect(scheduledTicketLabel(SAT_EVENING)!.length).toBeLessThanOrEqual(WIDTH);
  });
});

describe("is it for today", () => {
  it("is not, when it's next week", () => {
    expect(isForAnotherDay(SAT_EVENING, new Date("2026-08-15T02:00:00.000Z"))).toBe(true);
  });

  it("is, when it's later the same Manila day", () => {
    // Both 22 Aug in Manila: 09:00 and 18:30.
    expect(isForAnotherDay(SAT_EVENING, new Date("2026-08-22T01:00:00.000Z"))).toBe(false);
  });

  // The trap: 23:00 UTC is already tomorrow in Manila.
  it("compares Manila days, not UTC days", () => {
    expect(isForAnotherDay("2026-08-22T23:00:00.000Z", new Date("2026-08-22T10:00:00.000Z"))).toBe(true);
  });

  it("is never true for an order with no schedule", () => {
    expect(isForAnotherDay(null)).toBe(false);
  });
});

describe("the kitchen docket", () => {
  const base: TicketSource = {
    kind: "kitchen",
    restaurantName: "Lola's Kitchen",
    tableNumber: "—",
    orderType: "takeout",
    customerName: "Ana",
    orderId: "abcdef01-2345",
    createdAt: "2026-08-15T04:00:00.000Z",
    total: 100_000,
    items: [{ quantity: 2, name: "Lechon Belly", modifiers: [], lineTotal: 100_000 }],
  };

  it("carries the date the kitchen needs", () => {
    const out = ticketBodyLines(buildTicket({ ...base, scheduledFor: SAT_EVENING })).join("\n");
    expect(out).toContain("SCHEDULED FOR");
    expect(out).toContain("Sat");
    expect(out).toContain("6:30");
  });

  it("puts it above the order number, where it can't be skimmed past", () => {
    const lines = ticketBodyLines(buildTicket({ ...base, scheduledFor: SAT_EVENING }));
    const banner = lines.findIndex((l) => l.includes("SCHEDULED FOR"));
    const ref = lines.findIndex((l) => l.startsWith("Order #"));
    expect(banner).toBeGreaterThanOrEqual(0);
    expect(banner).toBeLessThan(ref);
  });

  it("warns the kitchen off cooking it", () => {
    const out = ticketBodyLines(buildTicket({ ...base, scheduledFor: SAT_EVENING })).join("\n");
    expect(out).toContain("DO NOT COOK YET");
  });

  // A banner on every ticket is a banner nobody reads.
  it("says nothing on an ordinary order", () => {
    const out = ticketBodyLines(buildTicket(base)).join("\n");
    expect(out).not.toContain("SCHEDULED");
    expect(out).not.toContain("DO NOT COOK");
  });

  it("stays inside the paper width", () => {
    for (const line of ticketLines(buildTicket({ ...base, scheduledFor: SAT_EVENING }))) {
      expect(line.length).toBeLessThanOrEqual(WIDTH);
    }
  });
});

describe("the customer's receipt", () => {
  const receipt = (extra: Partial<TicketSource> = {}) =>
    buildTicket({
      kind: "receipt",
      restaurantName: "Lola's Kitchen",
      tableNumber: "—",
      orderType: "takeout",
      orderId: "abcdef01-2345",
      createdAt: "2026-08-15T04:00:00.000Z",
      total: 100_000,
      items: [{ quantity: 1, name: "Lechon Belly", modifiers: [], lineTotal: 100_000 }],
      ...extra,
    });

  it("also states when the order is for", () => {
    expect(ticketBodyLines(receipt({ scheduledFor: SAT_EVENING })).join("\n")).toContain("SCHEDULED FOR");
  });

  it("leaves an ordinary receipt alone", () => {
    expect(ticketBodyLines(receipt()).join("\n")).not.toContain("SCHEDULED");
  });
});
