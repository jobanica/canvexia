import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { suggestedOrder } from "@/lib/pharmacy/alerts";
import { searchProducts } from "@/lib/pharmacy/counter-search";

/**
 * RAISING A PURCHASE ORDER.
 *
 * REPORTED — "purchase order design should be like this", against a form whose
 * every line was a `<select>` holding the whole catalogue. Fine at forty
 * products, unusable at 1,886 — the same wall the counter hit, for the same
 * reason, and a buyer working a forty-line order hits it forty times.
 */

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");
const form = src("app/purchase-orders/new/NewPoForm.tsx");

describe("choosing a product", () => {
  it("is a search, not a dropdown of everything", () => {
    expect(form).toMatch(/searchProducts\(products, line\.query, 8\)/);
    expect(form).not.toMatch(/products\.map\(\(p\) => \(\s*\n?\s*<option/);
  });

  it("submits the CHOSEN id, never what was typed", () => {
    // A search box submitted as the answer is how a typo becomes an order line
    // for nothing.
    expect(form).toMatch(/<input type="hidden" name="productId" value=\{line\.productId\} \/>/);
  });

  it("clears the chosen product when the text is edited again", () => {
    // Otherwise the box reads as one product while the hidden field carries
    // another — the worst possible version of this control.
    expect(form).toMatch(/onChange\(\{ query: e\.target\.value, productId: null \}\)/);
  });

  it("names quantity and cost only on lines that have a product", () => {
    // The action zips productId/quantity/unitCost BY INDEX. A half-typed line
    // that contributed a quantity but no id would shift every line after it
    // onto the wrong product.
    expect(form).toMatch(/name=\{line\.productId \? "quantity" : undefined\}/);
    expect(form).toMatch(/name=\{line\.productId \? "unitCost" : undefined\}/);
  });
});

describe("the low-stock list on the form", () => {
  it("is on the page, with an Add beside each row", () => {
    // Most orders are "what am I about to run out of". Putting that behind a
    // search means already knowing the answer.
    expect(form).toMatch(/Low in inventory \(\{low\.length\} to reorder\)/);
  });

  it("counts something out of stock even with no reorder point", () => {
    // The same rule the alerts page uses, and the reason a freshly imported
    // catalogue is not entirely invisible here.
    expect(form).toMatch(/p\.onHand === 0 \|\| \(p\.onHand <= p\.reorderPoint && p\.reorderPoint > 0\)/);
  });

  it("bumps an existing line rather than adding the same product twice", () => {
    // Two lines for one product is something a supplier reads as a mistake.
    expect(form).toMatch(/Already on the order: bump its quantity/);
  });

  it("fills an untouched empty line rather than leaving it above the new one", () => {
    expect(form).toMatch(/const blank = ls\.findIndex/);
  });
});

describe("what a line starts with", () => {
  it("suggests the shortfall as the quantity", () => {
    expect(suggestedOrder(13, 100)).toBe(87);
    expect(form).toMatch(/quantity: String\(suggestedOrder\(p\.onHand, p\.reorderPoint\)\)/);
  });

  it("defaults the cost to what the last delivery cost", () => {
    // Typing a price for forty lines is how a pharmacy stops raising orders.
    expect(form).toMatch(/unitCost: p\.lastCostCentavos > 0 \? \(p\.lastCostCentavos \/ 100\)\.toFixed\(2\) : ""/);
  });

  it("keeps money and quantity as raw text, never reformatted while typing", () => {
    // The same bug the till's tender box shipped with: a value reformatted on
    // every keystroke cannot be typed into past its first digit.
    expect(form).toMatch(/value=\{line\.unitCost\}/);
    expect(form).toMatch(/value=\{line\.quantity\}/);
    expect(form).not.toMatch(/^\s*type="number"/m);
  });
});

describe("the search itself", () => {
  const shelf = [
    { id: "1", name: "Biogesic 500mg", sku: "BIO500", barcode: null, genericName: "Paracetamol", onHand: 4 },
    { id: "2", name: "Amoxicillin 500mg", sku: "AMX500", barcode: null, genericName: "Amoxicillin", onHand: 0 },
  ];

  it("finds a product the buyer is about to order by SKU", () => {
    expect(searchProducts(shelf, "AMX500", 8)[0]!.id).toBe("2");
  });

  it("finds it by generic name too", () => {
    expect(searchProducts(shelf, "paracetamol", 8)[0]!.id).toBe("1");
  });

  it("caps the dropdown, because 1,886 rows is not a dropdown", () => {
    const many = Array.from({ length: 2000 }, (_, i) => ({
      id: String(i),
      name: `Item ${i}`,
      sku: null,
      barcode: null,
      genericName: null,
      onHand: 1,
    }));
    expect(searchProducts(many, "item", 8)).toHaveLength(8);
  });
});

describe("raising it", () => {
  it("is disabled until at least one line has a product", () => {
    expect(form).toMatch(/disabled=\{pending \|\| ready\.length === 0\}/);
  });

  it("says how many half-typed lines will be left out rather than failing", () => {
    // The buyer is mid-thought, not wrong.
    expect(form).toMatch(/with no product chosen will be left/);
  });
});
