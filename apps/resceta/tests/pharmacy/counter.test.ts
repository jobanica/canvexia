import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  changeFor,
  scanMatch,
  searchProducts,
  shortfall,
  tenderedTotal,
  type SearchableProduct,
} from "@/lib/pharmacy/counter-search";
import { redeemable, pointsEarned } from "@/lib/pharmacy/customer-input";

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
