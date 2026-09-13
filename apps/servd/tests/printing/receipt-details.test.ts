import { describe, it, expect } from "vitest";
import {
  buildTicket,
  ticketBodyLines,
  ticketCustomerLines,
  ticketLines,
  ticketTotals,
  WIDTH,
  type TicketSource,
} from "@/lib/printing/ticket";

/**
 * What a rider is holding, and what the customer is handed back.
 *
 * The docket used to say "DELIVERY - Ana" and nothing else, so where to go came
 * off Facebook and the number to ring came off the app.
 */

const base: TicketSource = {
  restaurantName: "Lola's Kitchen",
  tableNumber: "—",
  orderId: "abcdef01-2345-6789",
  createdAt: "2026-08-15T04:00:00.000Z",
  total: 100_000,
  items: [{ quantity: 1, name: "Adobo", modifiers: [], lineTotal: 100_000 }],
};

const delivery = (extra: Partial<TicketSource> = {}) =>
  buildTicket({
    ...base,
    orderType: "delivery",
    customerName: "Ana Cruz",
    customerPhone: "0917 123 4567",
    customerAddress: "Blk 7 Lot 12, Mahogany St, Barangay Buhangin, Davao City",
    ...extra,
  });

describe("the customer block", () => {
  it("carries the address and a number to ring", () => {
    const out = ticketCustomerLines(delivery()).join("\n");
    expect(out).toContain("Ana Cruz");
    expect(out).toContain("0917 123 4567");
    expect(out).toContain("Blk 7 Lot 12");
  });

  it("wraps a long address instead of running off the paper", () => {
    for (const line of ticketCustomerLines(delivery())) {
      expect(line.length).toBeLessThanOrEqual(WIDTH);
    }
  });

  it("survives the whole address being on one wrapped line", () => {
    const joined = ticketCustomerLines(delivery()).join(" ").replace(/\s+/g, " ");
    expect(joined).toContain("Barangay Buhangin, Davao City");
  });

  it("can be turned off", () => {
    expect(ticketCustomerLines(delivery({ showCustomer: false }))).toEqual([]);
  });

  it("says nothing on a dine-in ticket — the table number already did", () => {
    const t = buildTicket({ ...base, orderType: "dine_in", tableNumber: "5", customerName: "Ana" });
    expect(ticketCustomerLines(t)).toEqual([]);
  });

  it("shows a pickup customer's number but not an address", () => {
    const t = delivery({ orderType: "takeout" });
    const out = ticketCustomerLines(t).join("\n");
    expect(out).toContain("0917 123 4567");
    expect(out).not.toContain("Mahogany");
  });

  it("prints nothing at all when there are no details to print", () => {
    const t = buildTicket({ ...base, orderType: "delivery" });
    expect(ticketCustomerLines(t)).toEqual([]);
  });

  it("reaches the rendered receipt", () => {
    // Joined with spaces because the address wraps across lines on 58mm paper.
    const rendered = ticketLines(delivery()).join(" ").replace(/\s+/g, " ");
    expect(rendered).toContain("Blk 7 Lot 12, Mahogany St");
  });
});

describe("cash received and change", () => {
  const paid = (extra: Partial<TicketSource> = {}) =>
    buildTicket({
      ...base,
      kind: "receipt",
      paymentMethod: "cash",
      paymentAmount: 100_000,
      cashTendered: 150_000,
      ...extra,
    });

  it("shows what was handed over and what came back", () => {
    const out = ticketBodyLines(paid()).join("\n");
    expect(out).toContain("Cash received");
    expect(out).toContain("1500.00");
    expect(out).toContain("Change");
    expect(out).toContain("500.00");
  });

  it("can be turned off", () => {
    expect(ticketBodyLines(paid({ showCashTendered: false })).join("\n")).not.toContain(
      "Cash received",
    );
  });

  it("stays off a card sale", () => {
    const out = ticketBodyLines(paid({ paymentMethod: "card_terminal" })).join("\n");
    expect(out).not.toContain("Cash received");
  });

  it("is skipped when nothing was recorded", () => {
    expect(ticketBodyLines(paid({ cashTendered: null })).join("\n")).not.toContain("Cash received");
  });

  it("never prints negative change", () => {
    // Under-tendered is a data error, not a debt to print back at the customer.
    const change = ticketBodyLines(paid({ cashTendered: 90_000 })).find((l) => l.startsWith("Change"));
    expect(change).toBeDefined();
    expect(change).not.toContain("-");
    expect(change).toContain("0.00");
  });

  // A bill isn't a receipt: nothing has been handed over yet.
  it("says nothing on a bill", () => {
    const bill = buildTicket({ ...base, kind: "bill", cashTendered: 150_000 });
    expect(ticketBodyLines(bill).join("\n")).not.toContain("Cash received");
  });
});

describe("the card fee on the receipt", () => {
  const carded = buildTicket({
    ...base,
    kind: "receipt",
    surchargeAmount: 3_500,
    surchargeLabel: "Card fee (3.5%)",
    paymentMethod: "card_terminal",
  });

  it("is its own line, with the rate on it", () => {
    expect(ticketBodyLines(carded).join("\n")).toContain("Card fee (3.5%)");
  });

  it("is added to the total, not hidden in it", () => {
    expect(ticketTotals(carded).net).toBe(103_500);
    expect(ticketBodyLines(carded).join("\n")).toContain("1035.00");
  });

  it("shows the subtotal so the two numbers can be reconciled", () => {
    expect(ticketBodyLines(carded).join("\n")).toContain("Subtotal");
  });

  it("changes nothing on a receipt with no fee", () => {
    const plain = buildTicket({ ...base, kind: "receipt", paymentMethod: "cash" });
    const out = ticketBodyLines(plain).join("\n");
    expect(out).not.toContain("Card fee");
    expect(out).not.toContain("Subtotal");
    expect(ticketTotals(plain).net).toBe(100_000);
  });
});

describe("the kitchen ticket", () => {
  it("shows the address only when the kitchen asked for it", () => {
    const off = buildTicket({ ...base, kind: "kitchen", orderType: "delivery", customerAddress: "Mahogany St" });
    expect(ticketBodyLines(off).join("\n")).not.toContain("Mahogany");

    const on = buildTicket({
      ...base,
      kind: "kitchen",
      orderType: "delivery",
      customerAddress: "Mahogany St",
      kitchenShowAddress: true,
    });
    expect(ticketBodyLines(on).join("\n")).toContain("Mahogany");
  });

  // The cooks don't handle money and shouldn't be shown any.
  it("still carries no prices", () => {
    const t = buildTicket({
      ...base,
      kind: "kitchen",
      orderType: "delivery",
      customerAddress: "Mahogany St",
      kitchenShowAddress: true,
      surchargeAmount: 3_500,
    });
    const out = ticketBodyLines(t).join("\n");
    expect(out).not.toContain("1000.00");
    expect(out).not.toContain("Card fee");
  });
});
