import { pad, amt } from "./ticket";

/**
 * The end-of-shift (Z) report, as paper.
 *
 * A shift summary is not an order — it has no table, no line items, no VAT and
 * no QR — so it gets its own document rather than being forced into the Ticket
 * shape. What it DOES share is the 32-column thermal layout and the money
 * formatting, which is why those come from ticket.ts instead of being copied:
 * a receipt and a Z-report disagreeing about how to render ₱1,234.50 would be
 * its own small disaster.
 *
 * Pure and dependency-free, like the ticket model, so the layout is testable
 * without a printer.
 */

export interface ShiftReportSource {
  restaurantName: string;
  address?: string | null;
  phone?: string | null;
  cashier: string;
  /** Manila calendar day the shift covers, pre-formatted. */
  dayLabel: string;
  /** Manila wall-clock time this was printed, pre-formatted. */
  printedAt: string;
  orderCount: number;
  gross: number;
  discounts: number;
  byMethod: { label: string; amount: number; count: number }[];
  expenses: { category: string; amount: number; note: string | null }[];
  expensesTotal: number;
  cashCollected: number;
  cashOuts: { amount: number; note: string | null }[];
  expectedCash: number;
  net: number;
  /** Today's counter trade across every shift — context, not drawer money. */
  dayGross?: number;
  dayOrderCount?: number;
}

export interface ShiftReport {
  headerLines: string[];
  bodyLines: string[];
  footerLines: string[];
}

const RULE = "-".repeat(32);

/** Trim a label so a long expense note can't push the amount off the paper. */
function label(text: string, reserved: number): string {
  const room = 32 - reserved - 1;
  return text.length > room ? `${text.slice(0, room - 1)}…` : text;
}

function money(left: string, centavos: number, sign: "" | "-" = ""): string {
  const right = `${sign}${amt(centavos)}`;
  return pad(label(left, right.length), right);
}

export function buildShiftReport(src: ShiftReportSource): ShiftReport {
  const headerLines = [src.restaurantName || "Shift summary"];
  if (src.address) headerLines.push(src.address);
  if (src.phone) headerLines.push(src.phone);

  const b: string[] = [];
  b.push(`Cashier: ${label(src.cashier, 9)}`);
  b.push(`Shift:   ${src.dayLabel}`);
  b.push(`Printed: ${src.printedAt}`);

  b.push(RULE);
  b.push("SALES");
  b.push(pad("Orders paid", String(src.orderCount)));
  for (const m of src.byMethod) {
    b.push(money(`${m.label} (${m.count})`, m.amount));
  }
  if (src.discounts > 0) b.push(money("Discounts given", src.discounts, "-"));
  b.push(money("GROSS SALES", src.gross));

  b.push(RULE);
  b.push("EXPENSES");
  if (src.expenses.length === 0) {
    b.push("None recorded today.");
  } else {
    for (const e of src.expenses) {
      b.push(money(e.note ? `${e.category} - ${e.note}` : e.category, e.amount));
    }
  }
  b.push(money("TOTAL EXPENSES", src.expensesTotal));

  b.push(RULE);
  b.push("CASH DRAWER");
  b.push(money("Cash collected", src.cashCollected));
  for (const c of src.cashOuts) {
    b.push(money(c.note ? `Cash out - ${c.note}` : "Cash out", c.amount, "-"));
  }
  b.push(money("EXPECTED IN DRAWER", src.expectedCash));

  b.push(RULE);
  b.push(money("NET (PHP)", src.net));

  // Context, clearly fenced off from the drawer figures above. A shift that
  // opened this evening shows nothing for the morning's trade, and without
  // this line a cashier can't tell a quiet shift from a broken report.
  if (src.dayGross != null && src.dayGross !== src.gross) {
    b.push("");
    b.push("TODAY, ALL SHIFTS");
    b.push(pad("Orders paid", String(src.dayOrderCount ?? 0)));
    b.push(money("Counter sales", src.dayGross));
    b.push("(reference - not your drawer)");
  }

  // Somewhere to write the counted cash and sign off — the reason this gets
  // printed at all is so it can be checked against the drawer by hand.
  b.push("");
  b.push(pad("Counted cash", "________"));
  b.push(pad("Over / short", "________"));
  b.push("");
  b.push(pad("Cashier", "________"));
  b.push(pad("Manager", "________"));

  return {
    headerLines,
    bodyLines: b,
    footerLines: ["*** END OF SHIFT ***"],
  };
}
