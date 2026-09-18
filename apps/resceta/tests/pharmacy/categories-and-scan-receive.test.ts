import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  matchLine,
  matchAll,
  blockersFor,
  type MatchableProduct,
} from "@/lib/pharmacy/receipt-match";

/**
 * CATEGORIES, AND SCANNING A RECEIPT STRAIGHT INTO A DELIVERY.
 *
 * REPORTED — "add also categories in catalogue" and "in receive stocks, also
 * add the ai scanning of receipt, and it will auto add to the inventory once
 * verified the item arrived."
 *
 * The second one is where the care goes. "Auto add once verified" means the
 * scan does the typing and a person does the verifying — a wrong match books a
 * delivery of one medicine onto another's shelf and leaves the stock record
 * wrong for both.
 */

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

const catalogue: MatchableProduct[] = [
  { id: "p-bio", name: "Biogesic 500mg", genericName: "Paracetamol" },
  { id: "p-amox250", name: "Amoxicillin 250mg", genericName: "Amoxicillin" },
  { id: "p-amox500", name: "Amoxicillin 500mg", genericName: "Amoxicillin" },
  { id: "p-neo", name: "Neozep Forte", genericName: null },
];

describe("matching a scanned line to a product", () => {
  it("matches exactly through case, spacing and unit spelling", () => {
    expect(matchLine("BIOGESIC 500 MG", catalogue)).toEqual({
      productId: "p-bio",
      confidence: "exact",
    });
  });

  it("suggests a whole-word prefix but never calls it exact", () => {
    // "Biogesic 500mg Tab" on the receipt, "Biogesic 500mg" in the catalogue.
    const m = matchLine("Biogesic 500mg Tab", catalogue);
    expect(m.productId).toBe("p-bio");
    expect(m.confidence).toBe("likely");
  });

  it("refuses to match when two products are equally close", () => {
    // "Amoxicillin" alone could be either strength. One character apart and a
    // different medicine — ambiguous is NOT a match.
    expect(matchLine("Amoxicillin", catalogue)).toEqual({
      productId: null,
      confidence: "none",
    });
  });

  it("never confuses two strengths of the same molecule", () => {
    expect(matchLine("Amoxicillin 250mg", catalogue).productId).toBe("p-amox250");
    expect(matchLine("Amoxicillin 500mg", catalogue).productId).toBe("p-amox500");
  });

  it("uses a generic name only when it is unique", () => {
    // Paracetamol names exactly one product here, so it is a suggestion.
    expect(matchLine("Paracetamol", catalogue)).toEqual({
      productId: "p-bio",
      confidence: "likely",
    });
  });

  it("returns no match rather than guessing at something unrelated", () => {
    expect(matchLine("Vitamin C 500mg", catalogue).confidence).toBe("none");
  });

  it("ignores a too-short fragment", () => {
    // A three-letter prefix would match half the catalogue.
    expect(matchLine("Bio", catalogue).confidence).toBe("none");
  });
});

describe("what stops a scanned line being received", () => {
  const line = {
    productName: "Biogesic 500mg",
    genericName: null,
    quantity: 100,
    unitCostCentavos: 500,
    expiryDate: "2028-01-31",
    lotNumber: "LOT-A",
  };

  it("passes a complete, exactly-matched line", () => {
    expect(blockersFor(line, { productId: "p-bio", confidence: "exact" })).toEqual([]);
  });

  it("blocks a quantity or cost the photo could not read", () => {
    // Booking a zero of either is a batch saying the delivery was free or
    // empty — and a zero cost is a 100% margin on every future sale of it.
    expect(blockersFor({ ...line, quantity: 0 }, { productId: "p-bio", confidence: "exact" })).toContain(
      "quantity not read",
    );
    expect(
      blockersFor({ ...line, unitCostCentavos: 0 }, { productId: "p-bio", confidence: "exact" }),
    ).toContain("unit cost not read");
  });

  it("blocks a line with no product chosen", () => {
    expect(blockersFor(line, { productId: null, confidence: "none" })).toContain(
      "no product chosen",
    );
  });

  it("carries the blockers onto every matched line", () => {
    const [ready, notReady] = matchAll(
      [line, { ...line, productName: "Something else", quantity: 0 }],
      catalogue,
    );
    expect(ready!.blockers).toEqual([]);
    expect(notReady!.blockers.length).toBeGreaterThan(0);
  });
});

describe("the verify step before anything is received", () => {
  const panel = src("app/receiving/ScanIntoDelivery.tsx");
  const action = src("app/receiving/scan-actions.ts");

  it("pre-ticks ONLY lines that matched exactly and read cleanly", () => {
    // That is the whole of the "auto" in auto-add. Anything guessed,
    // ambiguous or unreadable starts unticked with the reason beside it.
    expect(panel).toContain(
      'l.blockers.length === 0 && l.match.confidence === "exact"',
    );
  });

  it("sends only the ticked lines into the form", () => {
    expect(panel).toContain("lines\n      .filter((_, i) => picked.has(i))");
  });

  it("matches against the session's own catalogue, on the server", () => {
    // Never against a product list the page sent up — that would let a forged
    // list point a delivery at another pharmacy's product.
    expect(action).toContain("await receivingOptions(staff.pharmacyId)");
    expect(action).not.toMatch(/formData\.get\("products"\)/);
  });

  it("writes nothing itself", () => {
    // The receiving form's own Receive button runs receiveDelivery — one stock
    // path for a scanned delivery and a hand-typed one.
    expect(action).not.toContain("pharmacyBatch");
    expect(action).not.toContain("systemDb");
  });

  it("appends to the form rather than replacing what was typed", () => {
    const form = src("app/receiving/ReceivingForm.tsx");
    expect(form).toContain("return [...kept, ...added];");
  });

  it("does not silently mark a missing expiry as 'no expiry'", () => {
    const form = src("app/receiving/ReceivingForm.tsx");
    expect(form).toContain("noExpiry: false,");
  });

  it("is hidden entirely when no API key is configured", () => {
    const form = src("app/receiving/ReceivingForm.tsx");
    expect(form).toContain("{scanEnabled && (");
    expect(src("app/receiving/page.tsx")).toContain("scanEnabled={receiptScanEnabled()}");
  });
});

describe("categories", () => {
  const server = src("server/pharmacy/categories.ts");
  const actions = src("app/catalogue/category-actions.ts");

  it("refuses two categories whose names differ only in case", () => {
    // "Antibiotics" and "antibiotics" on one dropdown is two shelves for one.
    expect(server).toContain('name: { equals: name, mode: "insensitive" }');
  });

  it("refuses to delete a category that still has products", () => {
    // categoryId is SET NULL on delete, so deleting would quietly un-file
    // them — a surprise if you thought it was empty.
    expect(server).toContain("if (category._count.products > 0)");
    expect(server).toContain("Move them first.");
  });

  it("offers moving the products somewhere as the way out", () => {
    expect(server).toContain("export async function recategorise");
    expect(actions).toContain("export async function moveCategory");
  });

  it("keeps the pharmacy in the WHERE clause of every write", () => {
    expect(server).toContain("where: { id: input.categoryId, pharmacyId: input.pharmacyId }");
    expect(server).toContain("where: { id: { in: ids }, pharmacyId: input.pharmacyId }");
  });

  it("gates every category write on manageCatalogue", () => {
    const gates = actions.match(/requireStaff\("manageCatalogue"\)/g) ?? [];
    expect(gates.length).toBe(3);
  });

  it("can filter the catalogue by category, including the unfiled ones", () => {
    // "No category" is the list somebody opens this filter to find.
    const table = src("app/catalogue/CatalogueTable.tsx");
    expect(table).toContain('category === "none" && p.categoryId !== null');
    expect(table).toContain("All categories");
  });
});
