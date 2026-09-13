import { describe, it, expect } from "vitest";
import { drawerPolicy, shouldOpenDrawer } from "@/lib/printing/drawer";
import { encodeDrawerKick, encodeTicket } from "@/lib/printing/escpos";
import { buildTicket } from "@/lib/printing/ticket";

/** ESC p — the pulse that throws the drawer solenoid. */
const KICK = [0x1b, 0x70, 0x00, 0x19, 0xfa];

const contains = (bytes: Uint8Array, seq: number[]) => {
  const a = Array.from(bytes);
  return a.some((_, i) => seq.every((b, j) => a[i + j] === b));
};

describe("drawerPolicy", () => {
  it("reads the three settings", () => {
    expect(drawerPolicy("never")).toBe("never");
    expect(drawerPolicy("cash")).toBe("cash");
    expect(drawerPolicy("any")).toBe("any");
  });

  // A till whose column hasn't been migrated reads null. Defaulting to "any"
  // would pop the drawer on every card sale for people who never asked for it.
  it("defaults to cash-only for anything unset or unrecognised", () => {
    expect(drawerPolicy(null)).toBe("cash");
    expect(drawerPolicy(undefined)).toBe("cash");
    expect(drawerPolicy("sometimes")).toBe("cash");
  });
});

describe("shouldOpenDrawer", () => {
  it("opens on cash under the default policy", () => {
    expect(shouldOpenDrawer("cash", "cash")).toBe(true);
  });

  // Nothing goes into the drawer on a card or e-wallet sale, so leaving it shut
  // is both the safer habit and what the cashier expects.
  it("stays shut for card and e-wallet under the default policy", () => {
    expect(shouldOpenDrawer("cash", "card_terminal")).toBe(false);
    expect(shouldOpenDrawer("cash", "gcash")).toBe(false);
  });

  it("opens for every method when the till gives change for e-wallets", () => {
    expect(shouldOpenDrawer("any", "gcash")).toBe(true);
    expect(shouldOpenDrawer("any", "cash")).toBe(true);
  });

  it("never opens when switched off", () => {
    expect(shouldOpenDrawer("never", "cash")).toBe(false);
  });

  // A bill, a kitchen docket or a reprint has no payment behind it. "Any"
  // means any payment method, not any piece of paper.
  it("doesn't open for documents that aren't a payment", () => {
    expect(shouldOpenDrawer("any", null)).toBe(false);
    expect(shouldOpenDrawer("cash", undefined)).toBe(false);
  });
});

describe("the ESC/POS pulse", () => {
  const ticket = buildTicket({
    kind: "receipt",
    restaurantName: "Mango Grill",
    tableNumber: "4",
    orderId: "abc",
    createdAt: "2026-08-12T10:00:00Z",
    total: 45000,
    items: [{ quantity: 1, name: "Adobo", modifiers: [], note: null, lineTotal: 45000 }],
  });

  it("emits the pulse on its own for a drawer-only job", () => {
    expect(contains(encodeDrawerKick(), KICK)).toBe(true);
  });

  it("leads the receipt, so the drawer is open before the paper is torn off", () => {
    const bytes = Array.from(encodeTicket(ticket, true));
    const kickAt = bytes.findIndex((_, i) => KICK.every((b, j) => bytes[i + j] === b));
    const textAt = Buffer.from(Uint8Array.from(bytes)).toString("latin1").indexOf("Mango Grill");
    expect(kickAt).toBeGreaterThanOrEqual(0);
    expect(kickAt).toBeLessThan(textAt);
  });

  it("is absent unless asked for — a bill must not open the drawer", () => {
    expect(contains(encodeTicket(ticket), KICK)).toBe(false);
    expect(contains(encodeTicket(ticket, false), KICK)).toBe(false);
  });

  it("still prints the receipt it was attached to", () => {
    const s = Buffer.from(encodeTicket(ticket, true)).toString("latin1");
    expect(s).toContain("Mango Grill");
    expect(s).toContain("Adobo");
  });
});
