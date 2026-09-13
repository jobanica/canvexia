import { describe, it, expect } from "vitest";
import { buildShiftReport, type ShiftReportSource } from "@/lib/printing/report";
import { encodeReport, encodeReportBase64 } from "@/lib/printing/escpos";

/**
 * The Z-report is what the owner counts the drawer against, so the numbers on
 * it have to be right and the columns have to line up on 32-character paper.
 */

const base: ShiftReportSource = {
  restaurantName: "Mango Grill",
  address: "123 Rizal St",
  phone: "0917 123 4567",
  cashier: "maria",
  dayLabel: "Aug 12, 2026",
  printedAt: "9:41 PM",
  orderCount: 12,
  gross: 458000, // ₱4,580.00
  discounts: 5000,
  byMethod: [
    { label: "Cash", amount: 300000, count: 8 },
    { label: "GCash", amount: 158000, count: 4 },
  ],
  expenses: [{ category: "Supplies", amount: 25000, note: "ice" }],
  expensesTotal: 25000,
  cashCollected: 300000,
  cashOuts: [{ amount: 100000, note: "bank" }],
  expectedCash: 200000,
  net: 433000,
};

const text = (s: ShiftReportSource) => buildShiftReport(s).bodyLines.join("\n");

describe("buildShiftReport", () => {
  it("carries every figure the cashier needs to close out", () => {
    const out = text(base);
    expect(out).toContain("Orders paid");
    expect(out).toContain("Cash (8)");
    expect(out).toContain("GCash (4)");
    expect(out).toContain("3000.00");
    expect(out).toContain("GROSS SALES");
    expect(out).toContain("4580.00");
    expect(out).toContain("TOTAL EXPENSES");
    expect(out).toContain("EXPECTED IN DRAWER");
    expect(out).toContain("2000.00");
    expect(out).toContain("NET (PHP)");
    expect(out).toContain("4330.00");
  });

  it("shows discounts and cash-outs as deductions", () => {
    const out = text(base);
    expect(out).toContain("-50.00"); // discounts
    expect(out).toContain("-1000.00"); // cash out
  });

  it("names the cashier and the day, not a raw timestamp", () => {
    const out = text(base);
    expect(out).toContain("Cashier: maria");
    expect(out).toContain("Aug 12, 2026");
    expect(out).toContain("9:41 PM");
  });

  // 58mm paper is 32 characters. A line that runs over wraps on the printer and
  // drops the amount onto its own line, which makes the report unreadable at a
  // glance — the one thing it has to be.
  it("never emits a line wider than the paper", () => {
    const long: ShiftReportSource = {
      ...base,
      expenses: [
        {
          category: "Kitchen supplies and cleaning materials",
          amount: 1234567,
          note: "delivered by the supplier this afternoon",
        },
      ],
      byMethod: [{ label: "Card (online, international)", amount: 999999, count: 123 }],
      cashOuts: [{ amount: 50000, note: "deposited at the bank branch downtown" }],
    };
    for (const line of buildShiftReport(long).bodyLines) {
      expect(line.length, JSON.stringify(line)).toBeLessThanOrEqual(32);
    }
  });

  it("keeps the amount intact when the label is what gets truncated", () => {
    const out = text({
      ...base,
      expenses: [{ category: "A very long expense category indeed", amount: 123456, note: null }],
    });
    expect(out).toContain("1234.56");
  });

  it("says so plainly when nothing was spent", () => {
    expect(text({ ...base, expenses: [], expensesTotal: 0 })).toContain("None recorded today.");
  });

  it("leaves somewhere to write the counted cash and sign off", () => {
    const out = text(base);
    expect(out).toContain("Counted cash");
    expect(out).toContain("Over / short");
    expect(out).toContain("Manager");
  });

  it("falls back to a heading when the restaurant has no name yet", () => {
    expect(buildShiftReport({ ...base, restaurantName: "" }).headerLines[0]).toBe("Shift summary");
  });

  it("omits contact lines that aren't configured", () => {
    const r = buildShiftReport({ ...base, address: null, phone: null });
    expect(r.headerLines).toEqual(["Mango Grill"]);
  });
});

describe("the today/all-shifts block", () => {
  // The bug this exists for: a shift that opened in the evening reports ₱0.00
  // while the closed-orders list shows a dozen paid tickets. Without this line
  // the cashier can't tell a quiet shift from a broken report.
  it("shows the day's trade when it differs from the shift's", () => {
    const out = text({ ...base, gross: 0, orderCount: 0, dayGross: 458000, dayOrderCount: 12 });
    expect(out).toContain("TODAY, ALL SHIFTS");
    expect(out).toContain("4580.00");
    expect(out).toContain("not your drawer");
  });

  // On a single-shift day the two numbers are the same and repeating them
  // would just invite someone to add them together.
  it("is omitted when the shift IS the whole day", () => {
    const out = text({ ...base, dayGross: base.gross, dayOrderCount: base.orderCount });
    expect(out).not.toContain("TODAY, ALL SHIFTS");
  });

  it("is omitted entirely when the day figure isn't available", () => {
    expect(text(base)).not.toContain("TODAY, ALL SHIFTS");
  });

  it("still fits the paper", () => {
    const r = buildShiftReport({ ...base, gross: 0, dayGross: 12345678, dayOrderCount: 999 });
    for (const line of r.bodyLines) expect(line.length).toBeLessThanOrEqual(32);
  });
});

describe("encodeReport", () => {
  // The whole fix: the report goes to the printer as ESC/POS, the same as a
  // receipt, instead of through the browser's print dialog.
  it("emits an ESC/POS stream that initialises and cuts the paper", () => {
    const bytes = encodeReport(buildShiftReport(base));
    expect(bytes[0]).toBe(0x1b); // ESC
    expect(bytes[1]).toBe(0x40); // @  — initialise
    const tail = Array.from(bytes.slice(-3));
    expect(tail).toEqual([0x1d, 0x56, 0x00]); // GS V 0 — full cut
  });

  it("includes the printed figures in the byte stream", () => {
    const s = Buffer.from(encodeReport(buildShiftReport(base))).toString("latin1");
    expect(s).toContain("Mango Grill");
    expect(s).toContain("SHIFT SUMMARY");
    expect(s).toContain("4330.00");
  });

  it("base64-encodes for transport", () => {
    const b64 = encodeReportBase64(buildShiftReport(base));
    expect(b64).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(Buffer.from(b64, "base64").length).toBeGreaterThan(100);
  });
});
