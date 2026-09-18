import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THREE THINGS THE TILL AND THE STOCKROOM WERE MISSING.
 *
 * REPORTED — "in the till, once shift is closed, it should auto print the
 * receipt" / "sending a stock, add a search button" / "add also a printer
 * settings, so i can try to connect the printer."
 */

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

describe("closing the till", () => {
  const shifts = src("server/pharmacy/shifts.ts");
  const panel = src("app/shift/ShiftPanel.tsx");
  const actions = src("app/shift/actions.ts");

  it("hands back the Z-reading it just cut", () => {
    // A drawer counted and a reading nobody printed is a shift somebody has to
    // reconstruct later.
    expect(shifts).toMatch(/readingId: reading\.id/);
    expect(actions).toMatch(/readingId: res\.readingId/);
  });

  it("prints it without leaving the till", () => {
    expect(panel).toMatch(/<ReceiptPrinter/);
    expect(panel).toMatch(/\/readings\/\$\{state\.readingId\}\/print\?auto=1/);
  });

  it("obeys the same print setting the receipt does", () => {
    // One switch for the whole till, not two that can disagree.
    expect(panel).toMatch(/\{autoPrint && \(/);
    expect(src("app/shift/page.tsx")).toMatch(/autoPrint=\{printing\?\.autoPrintReceipt \?\? true\}/);
  });

  it("still offers the reading by hand", () => {
    expect(panel).toMatch(/Open the Z-reading/);
  });

  it("says a reprint does not close a shift", () => {
    // A Z-reading is the record of a closed shift; reprinting one must never
    // look like closing another.
    expect(src("app/readings/[id]/print/page.tsx")).toMatch(/this does not close a shift/);
  });

  it("counts voided sales on the slip without giving them money", () => {
    expect(src("app/readings/[id]/print/page.tsx")).toMatch(/label="Voided"/);
  });
});

describe("the printer that prints both", () => {
  const printer = src("app/pos/ReceiptPrinter.tsx");

  it("takes any document, not just a sale", () => {
    // It prints a receipt and a Z-reading now; a second copy of this component
    // would be a second place for the frame rules to drift.
    expect(printer).toMatch(/jobId: string;/);
    expect(printer).toMatch(/src: string;/);
  });

  it("still prints once per document", () => {
    expect(printer).toMatch(/if \(printed\.current === jobId\) return;/);
  });
});

describe("sending stock", () => {
  const form = src("app/transfers/new/TransferForm.tsx");

  it("has a search, because the shelf is thousands of batches long", () => {
    expect(form).toMatch(/Search for an item, lot or expiry/);
  });

  it("keeps typed quantities in state, not in the inputs", () => {
    // Filtering unmounts rows. In the DOM, searching for the next item would
    // silently discard the quantity already typed for the last one — a
    // transfer that sends less than the person believes, with nothing to say
    // so.
    expect(form).toMatch(/const \[qty, setQty\] = useState<Record<string, string>>\(\{\}\)/);
    expect(form).toMatch(/value=\{qty\[b\.id\] \?\? ""\}/);
  });

  it("submits from the map, so a hidden row is still sent", () => {
    // batchId[i] and quantity[i] must describe the same batch whatever is
    // filtered — they are generated together for exactly that reason.
    expect(form).toMatch(/\{chosen\.map\(\(b\) => \(/);
    expect(form).toMatch(/WRITTEN FROM THE MAP, NOT FROM THE VISIBLE ROWS/);
  });

  it("warns when more is typed than the batch holds", () => {
    expect(form).toMatch(/only \{b\.quantity\} on hand/);
  });

  it("says the hidden rows are still being sent when the list is capped", () => {
    expect(form).toMatch(/still being sent/);
  });
});

describe("the printer settings", () => {
  const settings = src("app/settings/SettingsForm.tsx");
  const test = src("app/settings/test-print/page.tsx");

  it("says how printing actually works rather than asking for an IP", () => {
    // Resceta prints through the browser to the device's own printer. A box
    // asking for an address would be a box that does nothing.
    expect(settings).toMatch(/Receipts print through this device/);
    expect(settings).not.toMatch(/name="printerIp"/);
  });

  it("offers a test print", () => {
    expect(settings).toMatch(/\/settings\/test-print\?auto=1/);
    expect(settings).toMatch(/Send a test print/);
  });

  it("tells somebody what to change in the print dialog", () => {
    expect(settings).toMatch(/headers and footers off/);
    expect(test).toMatch(/Turn OFF headers and footers/);
  });

  it("makes the test slip impossible to mistake for a receipt", () => {
    // One that looks like a receipt ends up in a drawer being counted.
    expect(test).toMatch(/\*\*\* TEST PRINT \*\*\*/);
    expect(test).toMatch(/NOT A RECEIPT — NOT A SALE/);
    expect(test).not.toMatch(/receiptNumber/);
  });

  it("renders at the width the pharmacy actually set", () => {
    expect(test).toMatch(/const mm = shop\?\.receiptPaperMm \?\? 58/);
  });
});
