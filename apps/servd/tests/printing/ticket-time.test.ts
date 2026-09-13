import { describe, it, expect } from "vitest";
import { buildTicket, ticketBodyLines, type TicketSource } from "@/lib/printing/ticket";

/**
 * The time printed on a ticket has to be the time on the wall.
 *
 * The ticket is built on the server, which runs in UTC. A bare toLocaleString()
 * therefore printed Manila-minus-8: an order paid for at 12:54 PM came off the
 * printer stamped 4:54:10 AM, eight hours before the Maya receipt in the
 * customer's hand. For a document headed "OFFICIAL RECEIPT" — one that gets
 * matched against a payment app, a delivery dispute, or a day's Z-report —
 * that's not cosmetic.
 *
 * So these tests assert the Manila clock reading, not just "some date".
 */

// 04:54:10 UTC on 18 Aug 2026 === 12:54 PM in Manila (UTC+8, no DST).
const PLACED_AT = "2026-08-18T04:54:10.000Z";

const source: TicketSource = {
  restaurantName: "RR's Chicken N' Ribs",
  tableNumber: "—",
  orderId: "e040913c-1111-2222",
  createdAt: PLACED_AT,
  total: 32_800,
  items: [{ quantity: 1, name: "Solo Fricken", modifiers: [], lineTotal: 32_800 }],
};

describe("the timestamp on a ticket", () => {
  it("prints the Manila clock on the customer's receipt, not UTC", () => {
    const out = ticketBodyLines(buildTicket(source)).join("\n");
    expect(out).toContain("12:54");
    expect(out).not.toContain("4:54");
  });

  it("prints the Manila clock on the kitchen docket too", () => {
    const out = ticketBodyLines(buildTicket({ ...source, kind: "kitchen" })).join("\n");
    expect(out).toContain("12:54");
    expect(out).not.toContain("4:54");
  });

  it("keeps the Manila calendar date, which UTC can push to the day before", () => {
    // 00:30 Manila on the 18th is still 16:30 UTC on the 17th — printing UTC
    // would date a midnight order to yesterday, and file it in the wrong shift.
    const out = ticketBodyLines(
      buildTicket({ ...source, createdAt: "2026-08-17T16:30:00.000Z" }),
    ).join("\n");
    expect(out).toContain("Aug 18, 2026");
    expect(out).not.toContain("Aug 17");
  });

  it("is short enough not to wrap the 32-column paper", () => {
    const line = ticketBodyLines(buildTicket(source)).find((l) => l.includes("12:54"));
    expect(line).toBeDefined();
    expect(line!.length).toBeLessThanOrEqual(32);
  });
});
