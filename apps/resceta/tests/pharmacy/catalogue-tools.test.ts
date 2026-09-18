import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv, readImport, toCentavos, toExpiryIso, toWhole } from "@/lib/pharmacy/csv";
import {
  findDuplicates,
  normaliseName,
  byKeepPreference,
  type DuplicateCandidate,
} from "@/lib/pharmacy/duplicates";

/**
 * THE THREE BULK TOOLS — import a CSV, merge duplicates, scan a receipt.
 *
 * REPORTED — "in inventory or catalogue, add those scan, merge and upload via
 * csv."
 *
 * Every rule that could quietly corrupt a catalogue is pinned here, because all
 * three tools write in bulk and none of them is watched line by line.
 */

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

describe("parsing a supplier's CSV", () => {
  it("keeps a comma that lives inside a quoted field", () => {
    // `split(",")` shifts every column after the first quoted field — a price
    // lands in the barcode column and nobody sees a parse error.
    const grid = parseCsv('name,price\n"Amoxicillin 500mg, 100s",850.00');
    expect(grid[1]).toEqual(["Amoxicillin 500mg, 100s", "850.00"]);
  });

  it("handles doubled quotes, embedded newlines, CRLF and a BOM", () => {
    const grid = parseCsv('﻿name,note\r\n"A ""B""","two\nlines"\r\n');
    expect(grid[0]).toEqual(["name", "note"]);
    expect(grid[1]).toEqual(['A "B"', "two\nlines"]);
  });

  it("drops a trailing blank line rather than importing it as a product", () => {
    expect(parseCsv("name\nBiogesic\n\n")).toHaveLength(2);
  });

  it("matches header names loosely", () => {
    // "Generic Name", "generic" and "GENERIC_NAME" are the same column.
    const file = readImport(parseCsv("Product,Generic Name,SRP\nBiogesic,Paracetamol,8.00"));
    expect(file.error).toBeNull();
    expect(file.rows[0]).toMatchObject({
      name: "Biogesic",
      genericName: "Paracetamol",
      priceCentavos: 800,
    });
  });

  it("refuses a file with no product-name column", () => {
    const file = readImport(parseCsv("price,qty\n8.00,10"));
    expect(file.error).toMatch(/product-name column/);
    expect(file.rows).toHaveLength(0);
  });
});

describe("reading the numbers", () => {
  it("turns pesos into centavos, punctuation and all", () => {
    expect(toCentavos("₱1,234.50")).toBe(123450);
    expect(toCentavos("8")).toBe(800);
    expect(toCentavos("")).toBeNull();
    expect(toCentavos("abc")).toBeNull();
  });

  it("refuses a fractional quantity instead of dropping the point", () => {
    // An earlier version stripped non-digits, so "12.5" became 125 — a
    // fractional quantity silently becoming ten times the stock.
    expect(toWhole("12")).toBe(12);
    expect(toWhole("12.5")).toBeNull();
    expect(toWhole("1,200")).toBe(1200);
    expect(toWhole("-4")).toBeNull();
  });
});

describe("reading an expiry date off a receipt", () => {
  it("treats a month with no day as the LAST day of that month", () => {
    // "EXP 06/2027" means the pack is good through the whole of June. Reading
    // it as the 1st writes off a month of saleable stock every time.
    expect(toExpiryIso("06/2027")).toBe("2027-06-30");
    expect(toExpiryIso("Jun 2027")).toBe("2027-06-30");
    expect(toExpiryIso("2027-02")).toBe("2027-02-28");
  });

  it("reads a full date day-first, as Philippine suppliers write it", () => {
    expect(toExpiryIso("30/06/2027")).toBe("2027-06-30");
    expect(toExpiryIso("2027-06-30")).toBe("2027-06-30");
  });

  it("recovers when the day and month are the wrong way round", () => {
    // 13 cannot be a month, so this is m/d/y however it was typed.
    expect(toExpiryIso("06/13/2027")).toBe("2027-06-13");
  });

  it("returns null rather than guessing", () => {
    // A silently wrong expiry is the one error this system exists to prevent.
    expect(toExpiryIso("next year")).toBeNull();
    expect(toExpiryIso("99/99/9999")).toBeNull();
  });
});

describe("what the importer refuses", () => {
  const rowsOf = (csv: string) => readImport(parseCsv(csv)).rows;

  it("refuses opening stock with no cost", () => {
    // A batch at zero cost is a 100% margin on every future sale of it.
    const [row] = rowsOf("name,quantity,cost\nBiogesic,100,");
    expect(row!.problems).toContain("opening quantity given with no unit cost");
  });

  it("reports a bad number instead of importing a zero", () => {
    const [row] = rowsOf("name,price\nBiogesic,eight pesos");
    expect(row!.problems.some((p) => p.includes("price"))).toBe(true);
  });

  it("keeps broken rows in the result with their line numbers", () => {
    // An importer that silently drops what it could not read leaves somebody
    // comparing counts and guessing which rows went missing.
    const rows = rowsOf("name,price\nGood,8.00\n,5.00");
    expect(rows).toHaveLength(2);
    expect(rows[1]!.line).toBe(3);
    expect(rows[1]!.problems).toContain("no product name");
  });

  it("defaults a missing unit rather than failing the row", () => {
    expect(rowsOf("name\nBiogesic")[0]!.unit).toBe("piece");
  });
});

describe("finding the same medicine entered twice", () => {
  const p = (over: Partial<DuplicateCandidate>): DuplicateCandidate => ({
    id: Math.random().toString(36).slice(2),
    name: "Biogesic",
    genericName: "Paracetamol",
    form: "Tablet",
    strength: "500mg",
    sku: null,
    barcode: null,
    priceCentavos: 800,
    onHand: 0,
    isActive: true,
    createdAt: new Date("2026-01-01"),
    ...over,
  });

  it("normalises spacing, case and unit spelling", () => {
    expect(normaliseName("BIOGESIC 500 MG")).toBe(normaliseName("Biogesic 500mg"));
    expect(normaliseName("Co-Amoxiclav")).toBe(normaliseName("co amoxiclav"));
  });

  it("groups two spellings of one product", () => {
    const groups = findDuplicates([p({ name: "Biogesic 500mg" }), p({ name: "BIOGESIC 500 MG" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.reason).toBe("name");
  });

  it("does NOT group two different strengths", () => {
    // Folding these together is a dispensing error, not a tidy-up — which is
    // why the match is exact-after-normalising and never fuzzy.
    const groups = findDuplicates([p({ strength: "500mg" }), p({ strength: "250mg" })]);
    expect(groups).toHaveLength(0);
  });

  it("prefers a shared barcode as the reason over a shared name", () => {
    const groups = findDuplicates([
      p({ name: "Biogesic", barcode: "4800001" }),
      p({ name: "Biogesic tabs", barcode: "4800001" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.reason).toBe("barcode");
  });

  it("never puts one product in two groups", () => {
    // The same rows appearing twice means merging one leaves the other stale.
    const shared = p({ sku: "BIO500" });
    const groups = findDuplicates([shared, p({ sku: "BIO500" }), p({})]);
    const ids = groups.flatMap((g) => g.members.map((m) => m.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("suggests keeping the one with stock", () => {
    // Keeping the empty one means moving every batch for nothing.
    const withStock = p({ onHand: 40 });
    const empty = p({ onHand: 0 });
    expect([empty, withStock].sort(byKeepPreference)[0]).toBe(withStock);
  });

  it("prefers an active product over an archived one", () => {
    const live = p({ isActive: true });
    const archived = p({ isActive: false, onHand: 99 });
    expect([archived, live].sort(byKeepPreference)[0]).toBe(live);
  });
});

describe("merging moves everything and deletes nothing", () => {
  const merge = src("server/pharmacy/merge-products.ts");

  it("re-points every table that names a product", () => {
    for (const table of [
      "pharmacyBatch",
      "pharmacyStockMovement",
      "pharmacySaleItem",
      "pharmacyPurchaseOrderItem",
      "pharmacyWriteoff",
      "pharmacyStockTransferItem",
      "pharmacyOrderItem",
    ]) {
      expect(merge).toContain(`tx.${table}.updateMany`);
    }
  });

  it("archives the losers rather than deleting them", () => {
    // A deleted product nulls the productId on years of sale lines, and the
    // recall trail from a lot number back to a product ends there.
    expect(merge).toContain("data: { isActive: false, sku: null, barcode: null }");
    expect(merge).not.toContain("tx.pharmacyProduct.delete");
  });

  it("frees the loser's SKU and barcode so the survivor can take them", () => {
    expect(merge).toContain("sku: null, barcode: null");
    expect(merge).toContain("const donor = all.find(");
  });

  it("checks every id belongs to this pharmacy", () => {
    // A forged id would merge another pharmacy's product into yours, taking
    // its stock with it — the worst thing on this screen.
    expect(merge).toContain("where: { id: { in: [input.keepId, ...mergeIds] }, pharmacyId: input.pharmacyId }");
    expect(merge).toContain("if (all.length !== mergeIds.length + 1)");
    expect(merge).toContain("One of those products was not found.");
  });

  it("runs in one transaction", () => {
    expect(merge).toContain("return await systemDb(async (tx) => {");
  });
});

describe("the receipt scanner", () => {
  const scan = src("server/pharmacy/receipt-scan.ts");

  it("is off unless a key is configured", () => {
    // A missing key must not be a crash on the receiving screen.
    expect(scan).toContain("return Boolean(process.env.ANTHROPIC_API_KEY);");
    expect(scan).toContain("Receipt scanning is not switched on for this pharmacy.");
  });

  it("writes nothing at all", () => {
    // The extraction is a draft a human checks; receiving does the writing.
    expect(scan).not.toContain("pharmacyBatch.create");
    expect(scan).not.toContain("pharmacyStockMovement.create");
    expect(scan).not.toContain("systemDb");
  });

  it("validates the reply instead of trusting the schema it asked for", () => {
    // A malformed reply would otherwise reach the form as undefined and land
    // in the database as zero.
    expect(scan).toContain("ReceiptExtraction.safeParse(JSON.parse(text))");
  });

  it("checks for a refusal before reading the content", () => {
    expect(scan).toContain('response.stop_reason === "refusal"');
  });

  it("tells the model never to invent a value", () => {
    expect(scan).toContain("NEVER invent a value");
    expect(scan).toContain("A guessed expiry date is worse than no expiry date");
  });

  it("asks for the last day of the month when only a month is printed", () => {
    expect(scan).toContain("use the LAST day of that month");
  });

  it("uses the current model", () => {
    expect(scan).toContain('model: "claude-opus-5"');
  });
});

describe("who may use the tools", () => {
  const actions = src("app/catalogue/tools-actions.ts");

  it("gates importing and merging on manageCatalogue", () => {
    const gates = actions.match(/requireStaff\("manageCatalogue"\)/g) ?? [];
    expect(gates.length).toBe(2);
  });

  it("gates scanning on manageStock, not manageCatalogue", () => {
    // The person holding the delivery receipt is the pharmacist who took the
    // boxes in.
    expect(actions).toContain('requireStaff("manageStock")');
  });

  it("re-parses the file on the server rather than trusting the preview", () => {
    expect(actions).toContain("readImport(parseCsv(text))");
  });
});
