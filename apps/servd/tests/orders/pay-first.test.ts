import { describe, it, expect } from "vitest";
import { isCounterType, PAY_FIRST_TYPES, shouldPayFirst } from "@/lib/orders/pay-first";
import { ORDER_TYPES } from "@/lib/orders/order-type";
import { parsePrinterConfig } from "@/lib/printing/printer-config";

/**
 * Shops where you pay before you sit down.
 *
 * The customer walks to the counter, orders, pays, then finds a table. The till
 * had no way to express that: every POS order was created unpaid and settled
 * later off the board, so a cashier taking money up front had to punch the
 * order, find it again on the floor, and settle it as a second job with a queue
 * building behind them.
 */

describe("which order types it leads with", () => {
  // The customer has to actually be standing there for "pay first" to mean
  // anything.
  it("covers the two where the customer is at the counter", () => {
    expect(shouldPayFirst("dine_in", true)).toBe(true);
    expect(shouldPayFirst("takeout", true)).toBe(true);
  });

  it("leaves the ones where nobody is standing there", () => {
    // Ordered ahead, coming to collect — they aren't at the till yet.
    expect(shouldPayFirst("pickup", true)).toBe(false);
    // Cash on delivery is the norm; the money arrives with the rider.
    expect(shouldPayFirst("delivery", true)).toBe(false);
    expect(shouldPayFirst("third_party", true)).toBe(false);
  });

  it("changes nothing at all for a shop that hasn't turned it on", () => {
    for (const t of ORDER_TYPES) {
      expect(shouldPayFirst(t, false)).toBe(false);
    }
  });

  it("agrees with the type list it's built from", () => {
    for (const t of ORDER_TYPES) {
      expect(shouldPayFirst(t, true)).toBe(isCounterType(t));
    }
    expect([...PAY_FIRST_TYPES]).toEqual(["dine_in", "takeout"]);
  });
});

describe("the setting", () => {
  // It changes the shape of every order a cashier rings up, so it shouldn't
  // arrive unannounced in an app update.
  it("is off until somebody asks for it", () => {
    expect(parsePrinterConfig(null).payments.payFirst).toBe(false);
    expect(parsePrinterConfig({}).payments.payFirst).toBe(false);
    expect(parsePrinterConfig({ payments: {} }).payments.payFirst).toBe(false);
  });

  it("reads back what was saved", () => {
    expect(parsePrinterConfig({ payments: { payFirst: true } }).payments.payFirst).toBe(true);
  });

  it("doesn't disturb the card fee sitting beside it", () => {
    const c = parsePrinterConfig({ payments: { payFirst: true, cardSurchargeBp: 350 } });
    expect(c.payments.cardSurchargeBp).toBe(350);
    expect(c.payments.payFirst).toBe(true);
  });

  // Turning it on must not quietly rewrite what the receipt prints.
  it("leaves every other printer setting alone", () => {
    const c = parsePrinterConfig({ payments: { payFirst: true } });
    expect(c.receipt.showVat).toBe(true);
    expect(c.receipt.showCustomer).toBe(true);
    expect(c.kitchen.showAddress).toBe(false);
  });
});
