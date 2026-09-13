import { describe, it, expect } from "vitest";
import { buildTicket, ticketLines } from "@/lib/printing/ticket";
import { encodeTicket, encodeTicketBase64 } from "@/lib/printing/escpos";

const ticket = buildTicket({
  restaurantName: "Mango Grill",
  tableNumber: "7",
  orderId: "abcdef12-3456-7890-aaaa-bbbbbbbbbbbb",
  createdAt: "2026-06-14T10:00:00.000Z",
  total: 25000,
  paymentMethod: "cash",
  paymentAmount: 25000,
  qrUrl: "https://servd.app/r/mango-grill",
  items: [
    { quantity: 2, name: "Burger", modifiers: ["Large", "Extra cheese"], note: "no onions", lineTotal: 20000 },
    { quantity: 1, name: "Fries", modifiers: [], lineTotal: 5000 },
  ],
});

describe("ticket model", () => {
  it("derives a short uppercase order ref", () => {
    expect(ticket.orderRef).toBe("ABCDEF12");
  });
  it("renders human-readable lines including items, modifiers and notes", () => {
    const text = ticketLines(ticket).join("\n");
    expect(text).toContain("TABLE 7");
    expect(text).toContain("2x Burger");
    expect(text).toContain("+ Large");
    expect(text).toContain("! no onions");
    expect(text).toContain("TOTAL");
  });
});

describe("escpos encoder", () => {
  it("starts with the ESC @ init sequence and ends with a cut", () => {
    const bytes = encodeTicket(ticket);
    expect(bytes[0]).toBe(0x1b); // ESC
    expect(bytes[1]).toBe(0x40); // @
    // last 3 bytes are the GS V 0 cut command
    expect(Array.from(bytes.slice(-3))).toEqual([0x1d, 0x56, 0x00]);
  });
  it("produces a base64 payload", () => {
    expect(typeof encodeTicketBase64(ticket)).toBe("string");
    expect(encodeTicketBase64(ticket).length).toBeGreaterThan(0);
  });
});
