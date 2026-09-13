import { describe, it, expect } from "vitest";
import { buildTicket, ticketHeading, type TicketSource } from "@/lib/printing/ticket";

/**
 * What gets shouted across the room.
 *
 * A dine-in order doesn't always have a table: plenty of shops ring the order
 * up at the counter and seat people afterwards, and some have no floor plan at
 * all. Requiring one stopped those shops taking an order they were standing in
 * front of. Without a table the ticket carries the day's next number, and
 * that's what the customer gets called by.
 */

const base: TicketSource = {
  restaurantName: "Lola's Kitchen",
  tableNumber: "—",
  orderId: "abcdef01-2345",
  createdAt: "2026-08-17T04:00:00.000Z",
  total: 26_900,
  items: [{ quantity: 1, name: "Crispy Chicken", modifiers: [], lineTotal: 26_900 }],
};

const heading = (over: Partial<TicketSource>) => ticketHeading(buildTicket({ ...base, ...over }));

describe("dine-in", () => {
  it("uses the table when there is one", () => {
    expect(heading({ orderType: "dine_in", tableNumber: "5" })).toBe("TABLE 5");
  });

  it("uses the ticket number when there isn't", () => {
    expect(heading({ orderType: "dine_in", tableNumber: "#001" })).toBe("ORDER #001");
  });

  // "TABLE —" is not something anyone can call out.
  it("never prints an empty table", () => {
    expect(heading({ orderType: "dine_in", tableNumber: "—" })).toBe("ORDER");
    expect(heading({ orderType: "dine_in", tableNumber: "" })).toBe("ORDER");
  });

  it("doesn't call a ticket number a table", () => {
    expect(heading({ orderType: "dine_in", tableNumber: "#012" })).not.toContain("TABLE");
  });
});

describe("everything else is unchanged", () => {
  it("still names the customer on a pickup", () => {
    expect(heading({ orderType: "takeout", customerName: "Ana" })).toContain("Ana");
  });

  it("still names the customer on a delivery", () => {
    const out = heading({ orderType: "delivery", customerName: "Ana" });
    expect(out).toContain("DELIVERY");
    expect(out).toContain("Ana");
  });
});

/**
 * The reported bug: a shop that uses order numbers instead of tables got a
 * kitchen docket with no number on it. Two causes — the auto-print path never
 * read orderNumber at all, and the heading only ever showed a number for
 * dine-in, so a takeout ticket said "TAKEOUT - Ana" and nothing else.
 */
describe("order numbers on the paper", () => {
  it("puts the number on a takeout docket", () => {
    expect(heading({ orderType: "takeout", orderNumber: "#007", customerName: "Ana" })).toBe(
      "TAKEOUT #007 - Ana",
    );
  });

  it("puts the number on a pickup and a delivery too", () => {
    expect(heading({ orderType: "pickup", orderNumber: "#012" })).toContain("#012");
    expect(heading({ orderType: "delivery", orderNumber: "#012" })).toContain("#012");
  });

  it("prints the number alone when there is no customer name", () => {
    expect(heading({ orderType: "takeout", orderNumber: "#007" })).toBe("TAKEOUT #007");
  });

  it("keeps the number and drops the name when the line won't fit the paper", () => {
    // 32 characters is the whole width. The number is what gets called out.
    const out = heading({
      orderType: "takeout",
      orderNumber: "#007",
      customerName: "Maria Fernanda Dela Cruz-Santos",
    });
    expect(out).toBe("TAKEOUT #007");
  });

  it("uses the number for a dine-in order taken before anyone sat down", () => {
    expect(heading({ orderType: "dine_in", tableNumber: "—", orderNumber: "#003" })).toBe(
      "ORDER #003",
    );
  });

  it("still prefers a real table over the number", () => {
    // Both can exist. The table is where the food goes.
    expect(heading({ orderType: "dine_in", tableNumber: "5", orderNumber: "#003" })).toBe("TABLE 5");
  });

  it("still accepts a number smuggled through tableNumber", () => {
    // One caller has always passed it that way; nothing may regress there.
    expect(heading({ orderType: "dine_in", tableNumber: "#001" })).toBe("ORDER #001");
  });
});
