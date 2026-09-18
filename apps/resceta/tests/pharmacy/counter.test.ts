import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  amountToCentavos,
  changeFor,
  scanMatch,
  searchProducts,
  shortfall,
  tenderedTotal,
  type SearchableProduct,
} from "@/lib/pharmacy/counter-search";
import { redeemable, pointsEarned } from "@/lib/pharmacy/customer-input";
import { parseReceiptFlags } from "@/lib/pharmacy/settings-input";

/**
 * THE COUNTER.
 *
 * REPORTED — "for counter, make it like this design", against a screen that
 * rendered all 1,886 imported products as a flat list with plus and minus
 * buttons and no search box.
 *
 * Everything a till gets wrong in front of a customer is pinned here: which
 * product a scan resolves to, what is owed, and what change is handed back.
 */

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

const P = (over: Partial<SearchableProduct> & { id: string; name: string }): SearchableProduct => ({
  sku: null,
  barcode: null,
  genericName: null,
  onHand: 10,
  ...over,
});

const SHELF = [
  P({ id: "1", name: "Biogesic 500mg", sku: "BIO500", barcode: "4800001", genericName: "Paracetamol" }),
  P({ id: "2", name: "Biogesic 250mg", sku: "BIO250", barcode: "4800002", genericName: "Paracetamol" }),
  P({ id: "3", name: "Amoxicillin 500mg", sku: "AMX500", barcode: "4800003", genericName: "Amoxicillin" }),
  P({ id: "4", name: "Neozep Forte", sku: "NEO1", barcode: "4800004", onHand: 0 }),
];

describe("scanning", () => {
  it("resolves a barcode to exactly one product", () => {
    expect(scanMatch(SHELF, "4800003")?.id).toBe("3");
  });

  it("falls back to the SKU, because not everything is barcoded", () => {
    expect(scanMatch(SHELF, "BIO250")?.id).toBe("2");
  });

  it("ignores case and surrounding whitespace a scanner may add", () => {
    expect(scanMatch(SHELF, "  bio250 ")?.id).toBe("2");
  });

  it("NEVER resolves a name", () => {
    // "Biogesic" matches two strengths. Adding one of them silently is how the
    // wrong strength gets sold, so a name is a search and never a scan.
    expect(scanMatch(SHELF, "Biogesic")).toBeNull();
    expect(scanMatch(SHELF, "Biogesic 500mg")).toBeNull();
  });

  it("matches nothing on an empty box", () => {
    expect(scanMatch(SHELF, "   ")).toBeNull();
  });
});

describe("searching", () => {
  it("puts an exact identifier first", () => {
    expect(searchProducts(SHELF, "AMX500")[0]!.id).toBe("3");
  });

  it("prefers a name that starts with the query over one that contains it", () => {
    const shelf = [
      P({ id: "a", name: "Extra Amoxil" }),
      P({ id: "b", name: "Amoxil 500" }),
    ];
    expect(searchProducts(shelf, "amox")[0]!.id).toBe("b");
  });

  it("finds a product by its generic name", () => {
    const hits = searchProducts(SHELF, "paracetamol").map((p) => p.id);
    expect(hits).toContain("1");
    expect(hits).toContain("2");
  });

  it("shows out-of-stock products, but last", () => {
    const hits = searchProducts(SHELF, "neozep");
    // Hiding it would read as "we never carried this", which is a different
    // and wrong answer to the customer's question.
    expect(hits.map((p) => p.id)).toContain("4");
    expect(searchProducts(SHELF, "")!.at(-1)!.id).toBe("4");
  });

  it("caps how many it returns, because 1,886 tiles per keystroke is not a list", () => {
    const many = Array.from({ length: 2000 }, (_, i) => P({ id: String(i), name: `Item ${i}` }));
    expect(searchProducts(many, "item")).toHaveLength(60);
    expect(searchProducts(many, "")).toHaveLength(60);
  });

  it("returns nothing rather than everything when nothing matches", () => {
    expect(searchProducts(SHELF, "zzzz")).toHaveLength(0);
  });
});

describe("settling the bill", () => {
  it("adds up split tenders", () => {
    expect(tenderedTotal([{ method: "cash", amountCentavos: 50_000 }, { method: "gcash", amountCentavos: 25_000 }]))
      .toBe(75_000);
  });

  it("never reports negative change", () => {
    // -₱50 read as change is a cashier opening the drawer.
    expect(changeFor(100_000, [{ method: "cash", amountCentavos: 50_000 }])).toBe(0);
  });

  it("reports the gap as a shortfall instead", () => {
    expect(shortfall(100_000, [{ method: "cash", amountCentavos: 50_000 }])).toBe(50_000);
  });

  it("gives change once the bill is covered", () => {
    expect(changeFor(100_000, [{ method: "cash", amountCentavos: 120_000 }])).toBe(20_000);
    expect(shortfall(100_000, [{ method: "cash", amountCentavos: 120_000 }])).toBe(0);
  });

  it("ignores a negative amount typed into a tender row", () => {
    expect(tenderedTotal([{ method: "cash", amountCentavos: -5000 }])).toBe(0);
  });
});

describe("points at the till", () => {
  it("never redeems more than the balance", () => {
    expect(redeemable(500, 100, 100_000, 100).points).toBe(100);
  });

  it("never redeems more than the bill", () => {
    // Redeeming past the bill would make a negative total — a till that hands
    // out cash.
    expect(redeemable(500, 500, 10_000, 100).centavos).toBeLessThanOrEqual(10_000);
  });

  it("earns on the money actually received, not the bill", () => {
    // A bill settled partly with points must not also earn points on the part
    // paid for with points: that is a loop that mints value out of itself.
    const bill = 100_000;
    const redeemed = redeemable(200, 200, bill, 100).centavos;
    expect(pointsEarned(bill - redeemed, 1)).toBeLessThan(pointsEarned(bill, 1));
  });
});


describe("typing an amount into the tender box", () => {
  /**
   * REPORTED — "I cannot type the cash amount paid to me."
   *
   * The box held centavos and re-rendered `(c / 100).toFixed(2)` every
   * keystroke. Typing "5" became "5.00"; the next digit made "5.000", which
   * parses back to 5 and renders "5.00" again. The field was stuck on its first
   * digit and no sale could be completed.
   *
   * This walks the controlled-input round trip one keystroke at a time. It is
   * the only shape of test that would have caught it: every individual piece
   * was correct, and the LOOP was the bug.
   */
  const typeIn = (keys: string, render: (state: string) => string) => {
    let state = "";
    for (const key of keys) {
      state = render(state + key); // browser appends, React re-renders
    }
    return state;
  };

  const RAW = (s: string) => s; // what the fix does: show what was typed
  const REFORMATTING = (s: string) => {
    const c = amountToCentavos(s);
    return c ? (c / 100).toFixed(2) : "";
  };

  it("lets a cashier type a whole amount", () => {
    expect(typeIn("500", RAW)).toBe("500");
    expect(amountToCentavos(typeIn("500", RAW))).toBe(50_000);
  });

  it("lets them type centavos too", () => {
    expect(amountToCentavos(typeIn("1250.75", RAW))).toBe(125_075);
  });

  it("proves the old reformatting box could not be typed into", () => {
    // Guarding the REASON, not just the result: "500" came out as ₱5.
    expect(amountToCentavos(typeIn("500", REFORMATTING))).toBe(500);
  });

  it("accepts money written the way people write it", () => {
    expect(amountToCentavos("1,200.50")).toBe(120_050);
    expect(amountToCentavos("₱500")).toBe(50_000);
    expect(amountToCentavos("  500 ")).toBe(50_000);
  });

  it("never returns NaN, which would render as change of NaN", () => {
    expect(amountToCentavos("")).toBe(0);
    expect(amountToCentavos("abc")).toBe(0);
    expect(amountToCentavos("1.2.3")).toBe(0);
    expect(amountToCentavos("-50")).toBe(5000);
  });
});

describe("the counter screen", () => {
  const counter = src("app/pos/Counter.tsx");

  it("focuses the search box so a scanner can drive the sale", () => {
    expect(counter).toMatch(/autoFocus/);
  });

  it("does not submit the sale when Enter is pressed in the search box", () => {
    // A scanner ends every code with Enter. Without this the first scan
    // submits an empty cart.
    expect(counter).toMatch(/e\.preventDefault\(\); \/\/ never submit the sale from the search box/);
  });

  it("refuses to complete while anything is still owed", () => {
    expect(counter).toMatch(/disabled=\{pending \|\| lines\.length === 0 \|\| blockedOnRx \|\| !online \|\| owed > 0\}/);
  });

  it("clears the cart after a sale, so the next customer starts empty", () => {
    expect(counter).toMatch(/if \(state\.status !== "done"\) return;\s*\n\s*setCart\(\{\}\)/);
  });

  it("keeps the raw text in every money field, and formats none of it mid-typing", () => {
    // The rule that makes the field typeable at all. A `toFixed` in a value
    // bound to a keystroke handler is the bug that shipped.
    expect(counter).toMatch(/value=\{t\.input\}/);
    expect(counter).not.toMatch(/value=\{t\.amountCentavos/);
    expect(counter).toMatch(/value=\{redeemInput\}/);
  });

  it("does not use a number input for money", () => {
    // A number input fights a typed comma, shows spinners on a till, and
    // blanks itself on input the browser dislikes.
    // Anchored to an actual JSX attribute on its own line, so the comment
    // explaining WHY it is not used does not trip its own rule.
    expect(counter).not.toMatch(/^\s*type="number"/m);
  });

  it("computes its totals with the server's own function", () => {
    // Two copies of the SC/PWD formula is how a till shows one number and
    // charges another.
    expect(counter).toMatch(/from "@\/lib\/pharmacy\/discount"/);
    expect(counter).not.toMatch(/0\.2\s*\*|\* 0\.8/);
  });
});

describe("the sale path", () => {
  const sale = src("server/pharmacy/sale.ts");

  it("reads the points balance from the database, never the form", () => {
    expect(sale).toMatch(/tx\.pharmacyCustomer\.findFirst\(\{\s*\n?\s*where: \{ id: req\.customerId, pharmacyId: req\.pharmacyId \}/);
  });

  it("takes tendered as the SUM of the tenders when there are any", () => {
    // A separate tendered figure beside a list of payments is two numbers that
    // can disagree, and the disagreement is the change the till hands back.
    expect(sale).toMatch(/req\.payments\.reduce\(\(sum, p\) => sum \+ p\.amountCentavos, 0\)/);
  });

  it("writes a payment row even for a single cash sale", () => {
    expect(sale).toMatch(/for \(const p of tenders\)/);
    expect(sale).toMatch(/tx\.pharmacySalePayment\.create/);
  });

  it("records the largest tender as the sale's payment method", () => {
    expect(sale).toMatch(/paymentMethod: largestTender/);
  });

  it("writes both loyalty ledger rows signed, so a balance is a SUM", () => {
    expect(sale).toMatch(/points: -redemption\.points/);
    expect(sale).toMatch(/kind: "earn"/);
  });

  it("charges the redemption against what is owed, not the recorded total", () => {
    expect(sale).toMatch(/const dueCentavos = totals\.totalCentavos - redemption\.centavos/);
    expect(sale).toMatch(/changeCentavos: tendered - dueCentavos/);
  });
});

describe("printing the receipt when the sale settles", () => {
  const printer = src("app/pos/ReceiptPrinter.tsx");
  const autoPrint = src("app/receipts/[saleId]/print/AutoPrint.tsx");
  const counter = src("app/pos/Counter.tsx");

  /**
   * REPORTED — "i tried the sale, i dont see receipt printing it. it should
   * auto print."
   *
   * The print page had taken `?auto=1` since it was written, and its own
   * comment said the counter links here with it after a sale. The counter never
   * did. The mechanism existed and nothing drove it — which is the failure this
   * codebase keeps repeating, so it is pinned rather than trusted.
   */
  it("actually drives the print page from the counter", () => {
    // The printer now takes any document — a receipt or a Z-reading — so the
    // URL it loads is the CALLER's, and this pins the caller.
    expect(counter).toMatch(/<ReceiptPrinter/);
    expect(counter).toMatch(/src=\{`\/receipts\/\$\{state\.saleId\}\/print\?auto=1`\}/);
  });

  it("prints without taking the cashier off the counter", () => {
    // A navigation to the print page loses the till between customers, and the
    // queue does not stop for the back button.
    expect(printer).toMatch(/<iframe/);
    expect(printer).not.toMatch(/router\.push|redirect\(/);
  });

  it("gives the frame a real width, rather than hiding it to zero", () => {
    // display:none and a zero-width frame both stop the receipt laying out —
    // a thermal roll rendered at zero width prints as a column of characters.
    expect(printer).toMatch(/left: "-10000px"/);
    expect(printer).toMatch(/width: `\$\{paperMm \* 4\}px`/);
    expect(printer).not.toMatch(/display: "none"/);
  });

  it("prints once per sale, never twice", () => {
    // Two dialogs for one sale is two copies of the receipt, or a cashier
    // dismissing the second out of reflex.
    expect(printer).toMatch(/if \(printed\.current === jobId\) return;/);
    expect(autoPrint).toMatch(/if \(fired\.current\) return;/);
  });

  it("waits for the fonts before freezing the page", () => {
    // print() freezes the page as it is. Called before the webfont loads, the
    // columns on a 58mm roll do not line up with the total underneath them.
    expect(autoPrint).toMatch(/document\.fonts\?\.ready/);
  });

  it("still offers the receipt by hand when the roll does not come", () => {
    expect(printer).toMatch(/Print the receipt/);
    expect(counter).toMatch(/Open the receipt/);
  });
});

describe("the auto-print setting", () => {
  it("is left alone by a save that did not show the section", () => {
    // THE CHECKBOX TRAP: an unticked box is absent from FormData, so without
    // the marker "not sent" and "turned off" are the same thing — and saving
    // the shop's address would quietly stop every receipt printing.
    expect(parseReceiptFlags({ sectionPresent: null, autoPrintReceipt: null })).toEqual({});
  });

  it("is turned off only when the section was on screen and the box was clear", () => {
    expect(parseReceiptFlags({ sectionPresent: "1", autoPrintReceipt: null })).toEqual({
      autoPrintReceipt: false,
    });
  });

  it("is turned on when the box is ticked", () => {
    expect(parseReceiptFlags({ sectionPresent: "1", autoPrintReceipt: "on" })).toEqual({
      autoPrintReceipt: true,
    });
  });
});
