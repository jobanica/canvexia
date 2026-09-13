import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { methodLabel } from "@/lib/orders/shift-breakdown";
import { drawerPolicy, shouldOpenDrawer } from "@/lib/printing/drawer";
import { buildTicket, ticketBodyLines, type TicketSource } from "@/lib/printing/ticket";

/**
 * Grab and Foodpanda don't hand over money at the counter.
 *
 * The rider takes the food and the platform remits later, but the till only
 * offered Cash / GCash / Card — so those tickets were closed as money nobody
 * took. That put them in the wrong column of every report AND left the drawer
 * over by the amount at cash-out, because the till believed it was holding cash
 * that had never arrived.
 */

describe("the drawer", () => {
  // The one that actually costs something: an open till, repeatedly, for a
  // payment that never crossed the counter.
  it("stays shut on a third-party settle, even on the open-for-everything policy", () => {
    expect(shouldOpenDrawer("any", "third_party")).toBe(false);
    expect(shouldOpenDrawer("cash", "third_party")).toBe(false);
    expect(shouldOpenDrawer("never", "third_party")).toBe(false);
  });

  it("still opens for the methods that do put money in it", () => {
    expect(shouldOpenDrawer("cash", "cash")).toBe(true);
    expect(shouldOpenDrawer("any", "gcash")).toBe(true);
    expect(shouldOpenDrawer("any", "card_terminal")).toBe(true);
  });

  it("leaves the saved policy alone", () => {
    expect(drawerPolicy("any")).toBe("any");
    expect(drawerPolicy(undefined)).toBe("cash");
  });
});

describe("what it's called", () => {
  it("has a name of its own, not a raw enum value", () => {
    expect(methodLabel("third_party")).toBe("Third-party app");
  });

  it("prints on the receipt as a name a person can read", () => {
    const src: TicketSource = {
      kind: "receipt",
      restaurantName: "Lola's Kitchen",
      tableNumber: "—",
      orderType: "third_party",
      customerName: "food panda",
      orderId: "abcdef01-2345",
      createdAt: "2026-08-18T04:00:00.000Z",
      total: 29_900,
      paymentMethod: "third_party",
      paymentAmount: 29_900,
      items: [{ quantity: 1, name: "Lechon Kawali", modifiers: [], lineTotal: 29_900 }],
    };
    const out = ticketBodyLines(buildTicket(src)).join("\n");
    expect(out).toContain("Third-party app");
    expect(out).not.toContain("third_party");
  });

  // Nothing was handed over, so there is nothing to print about change.
  it("prints no cash-received line", () => {
    const t = buildTicket({
      kind: "receipt",
      restaurantName: "Lola's Kitchen",
      tableNumber: "—",
      orderType: "third_party",
      orderId: "abcdef01-2345",
      createdAt: "2026-08-18T04:00:00.000Z",
      total: 29_900,
      paymentMethod: "third_party",
      paymentAmount: 29_900,
      cashTendered: 50_000,
      items: [{ quantity: 1, name: "Lechon Kawali", modifiers: [], lineTotal: 29_900 }],
    });
    expect(ticketBodyLines(t).join("\n")).not.toContain("Cash received");
  });
});

/**
 * Four separate label maps read payment methods — the shift breakdown, the
 * Z-report, the printed receipt and the accounting page. A method missing from
 * one of them shows up there as a raw enum value, and this app has already been
 * bitten by screens that disagree about the same sale.
 */
describe("every screen knows the method", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

  const MAPS = [
    "src/lib/orders/shift-breakdown.ts",
    "src/server/orders/shift-summary.ts",
    "src/lib/printing/ticket.ts",
    "src/app/(platform)/admin/accounting/page.tsx",
  ];

  it.each(MAPS)("%s labels third_party", (file) => {
    expect(read(file)).toMatch(/third_party:\s*"/);
  });

  // If a method is added to the enum, every one of these needs it too.
  it.each(MAPS)("%s labels every method the enum has", (file) => {
    const schema = read("prisma/schema.prisma");
    const block = schema.slice(
      schema.indexOf("enum PaymentMethod {"),
      schema.indexOf("}", schema.indexOf("enum PaymentMethod {")),
    );
    const methods = block
      .split("\n")
      .slice(1)
      .map((l) => l.replace(/\/\/.*$/, "").replace(/^\s*\/\/\/.*$/, "").trim())
      .filter((l) => /^[a-z_]+$/.test(l));
    expect(methods.length).toBeGreaterThan(5);

    const src = read(file);
    for (const m of methods) {
      expect(src, `${file} has no label for "${m}"`).toContain(`${m}:`);
    }
  });
});

describe("the settle action", () => {
  const src = readFileSync(join(process.cwd(), "src/server/orders/cashier.ts"), "utf8");
  const fn = src.slice(src.indexOf("export async function settleThirdParty"));

  it("records the method as third_party, not as cash", () => {
    expect(fn).toContain('"third_party"');
    expect(fn.slice(0, fn.indexOf("type SettleOutcome"))).not.toContain('"cash"');
  });

  // A database that hasn't run the migration rejects the enum value outright.
  it("names the file to run instead of showing a Postgres string", () => {
    expect(fn).toContain("add-third-party-tender.sql");
  });
});
