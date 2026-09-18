import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EscPos, columnsFor, foldToAscii } from "@/lib/pharmacy/escpos";

/**
 * PRINTING STRAIGHT TO THE PRINTER.
 *
 * REPORTED — "it has a test print, but there is no option is it via usb or via
 * bluetooth."
 *
 * There was none, because the browser's print dialog hands the page to the
 * operating system and the OS picks the printer. That is a true answer and a
 * poor one, so there is now a second path: ESC/POS bytes over Web Bluetooth or
 * WebUSB, with no dialog.
 *
 * These pin the bytes. A wrong byte here is a receipt that comes out as noise
 * in front of a customer, and there is no stack trace for that.
 */

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");
const str = (b: Uint8Array) => Array.from(b).map((n) => String.fromCharCode(n)).join("");

describe("text a thermal printer can print", () => {
  it("turns the peso sign into P", () => {
    // The default character set is CP437, which has no peso sign. Sending it
    // prints a random glyph on every receipt, forever.
    expect(foldToAscii("₱1,234.50")).toBe("P1,234.50");
  });

  it("folds the punctuation this app actually emits", () => {
    // Every one of these appears in a receipt or a bucket label today.
    expect(foldToAscii("≤30 days")).toBe("<=30 days");
    expect(foldToAscii("2 × 5")).toBe("2 x 5");
    expect(foldToAscii("a · b")).toBe("a - b");
    expect(foldToAscii("“quoted”")).toBe('"quoted"');
    expect(foldToAscii("en–dash")).toBe("en-dash");
  });

  it("replaces anything still non-ASCII with a visible question mark", () => {
    // Visibly wrong beats a glyph that looks deliberate.
    expect(foldToAscii("Ωmega")).toBe("?mega");
  });

  it("keeps newlines, which are the line breaks", () => {
    expect(foldToAscii("a\nb")).toBe("a\nb");
  });
});

describe("the command bytes", () => {
  it("initialises with ESC @", () => {
    expect(Array.from(new EscPos().init().bytes())).toEqual([0x1b, 0x40]);
  });

  it("aligns with ESC a", () => {
    expect(Array.from(new EscPos().align("center").bytes())).toEqual([0x1b, 0x61, 1]);
    expect(Array.from(new EscPos().align("right").bytes())).toEqual([0x1b, 0x61, 2]);
    expect(Array.from(new EscPos().align("left").bytes())).toEqual([0x1b, 0x61, 0]);
  });

  it("feeds the paper clear of the head BEFORE cutting", () => {
    // Without the feed the blade slices through the last lines, because the
    // printed text is still under the head when it fires.
    const b = Array.from(new EscPos().cut().bytes());
    expect(b).toEqual([0x0a, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00]);
  });
});

describe("a label and a figure on one line", () => {
  it("pushes the figure to the right edge", () => {
    expect(str(new EscPos().row("TOTAL", "100.00", 20).bytes())).toBe("TOTAL         100.00\n");
  });

  it("NEVER truncates the figure", () => {
    // A total reading "1,234.5" because the last digit was cut is the one
    // failure this must not have. The label loses characters instead.
    const out = str(new EscPos().row("A very long product name indeed", "1,234.50", 20).bytes());
    expect(out).toContain("1,234.50");
    expect(out.trim()).toHaveLength(20);
  });

  it("always leaves a gap between the two", () => {
    const out = str(new EscPos().row("ABCDEFGHIJKLMNOP", "9.99", 20).bytes());
    expect(out).toMatch(/ 9\.99\n$/);
  });

  it("folds the peso sign inside a row too", () => {
    expect(str(new EscPos().row("Cash", "₱50.00", 16).bytes())).toContain("P50.00");
  });
});

describe("the roll's width", () => {
  it("is 32 columns on 58mm and 48 on 80mm", () => {
    expect(columnsFor(58)).toBe(32);
    expect(columnsFor(80)).toBe(48);
  });

  it("treats anything unexpected as the narrow roll", () => {
    // Too narrow wraps; too wide runs off the paper and is unreadable.
    expect(columnsFor(0)).toBe(32);
  });
});

describe("choosing how this till prints", () => {
  const link = src("lib/pharmacy/printer-link.ts");
  const panel = src("app/settings/PrinterPanel.tsx");

  it("saves the choice on the DEVICE, not in the pharmacy", () => {
    // A shop with a laptop at the front and a tablet at the back has two
    // printers connected two ways; one shared setting makes one of them wrong.
    expect(link).toMatch(/localStorage/);
    expect(panel).toMatch(/this device only/);
  });

  it("asks the browser what it supports rather than sniffing the user agent", () => {
    expect(link).toMatch(/typeof nav\.bluetooth !== "undefined"/);
    expect(link).toMatch(/typeof nav\.usb !== "undefined"/);
  });

  it("says why an option is unavailable instead of greying it out silently", () => {
    // Safari — every iPhone and iPad — has neither API.
    expect(panel).toMatch(/Safari on iPhone and iPad never does/);
  });

  it("requires a secure context, which both APIs do", () => {
    expect(link).toMatch(/window\.isSecureContext/);
  });

  it("survives blocked storage rather than throwing", () => {
    // Private browsing, and a till that cannot print because localStorage
    // threw is a till nobody can use.
    expect(link).toMatch(/} catch \{\s*\n\s*\/\/ Private browsing/);
  });

  it("sends in chunks, because a whole receipt in one write stalls", () => {
    expect(link).toMatch(/const SIZE = 180;/);
  });
});

describe("the till when a direct printer is set", () => {
  const printer = src("app/pos/ReceiptPrinter.tsx");

  it("does not also open the print dialog", () => {
    // Otherwise the cashier gets a dialog on every sale, on top of the receipt
    // that already came out.
    expect(printer).toMatch(/if \(savedMethod\(\) !== "dialog"\) \{/);
  });

  it("offers a button, because the browser demands a gesture", () => {
    // A completed sale is not a user gesture, and both APIs refuse without one.
    expect(printer).toMatch(/function DirectPrintButton/);
    expect(printer).toMatch(/user gesture, and a completed sale is not one/);
  });

  it("gets the bytes from the server, not from the page", () => {
    // Money formatting, the VAT box and the licence numbers belong where the
    // HTML receipt already gets them.
    expect(printer).toMatch(/fetch\(`\/api\/escpos\?type=\$\{type\}&id=/);
  });
});

describe("the document the server renders", () => {
  const route = src("app/api/escpos/route.ts");

  it("is scoped to the session's pharmacy", () => {
    expect(route).toMatch(/receiptFor\(staff\.pharmacyId, id\)/);
    expect(route).toMatch(/if \(!doc\) return new NextResponse\("Not found\.", \{ status: 404 \}\)/);
  });

  it("shouts when a sale was voided", () => {
    // Printing one that reads like a receipt is handing a customer proof of a
    // sale that was reversed.
    expect(route).toMatch(/\*\*\* VOIDED \*\*\*/);
  });

  it("refuses to call an incomplete document an official receipt", () => {
    expect(route).toMatch(/NOT AN OFFICIAL RECEIPT/);
  });

  it("prints the SC/PWD ID on the customer's copy", () => {
    expect(route).toMatch(/ID \$\{doc\.beneficiary\.idNo\}/);
  });

  it("is never cached", () => {
    // A stale receipt is somebody else's sale.
    expect(route).toMatch(/"Cache-Control": "no-store"/);
  });
});
