/**
 * CSV, parsed properly.
 *
 * WHY NOT `split(",")`. A pharmacy's supplier price list has commas inside
 * quoted fields ("Amoxicillin 500mg, 100s"), embedded newlines in a notes
 * column, and doubled quotes for a literal one. Splitting on commas silently
 * shifts every column after the first quoted field — which in this file means a
 * price landing in the barcode column and a barcode in the price. That is not a
 * parse error anybody sees; it is a catalogue full of wrong prices.
 *
 * Pure and dependency-free so the whole of it can be tested without a browser.
 */

/** RFC 4180-ish: quoted fields, doubled quotes, embedded newlines, BOM, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  // A BOM on the first header cell makes "name" not equal "name", and the
  // column goes unrecognised with no visible cause. Excel writes one.
  const s = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");

  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  // The last line usually has no trailing newline.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // A trailing blank line is not a product.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/**
 * The columns this understands, and the names people actually type.
 *
 * MATCHED LOOSELY ON PURPOSE. A file exported from a supplier's system says
 * "Generic Name", one typed by hand says "generic", and Excel adds trailing
 * spaces. Refusing all three because they are not "genericName" means the
 * importer gets used once and abandoned.
 */
const ALIASES: Record<string, string[]> = {
  name: ["name", "product", "productname", "item", "description", "brand"],
  genericName: ["generic", "genericname", "generic name", "molecule"],
  form: ["form", "dosageform", "type"],
  strength: ["strength", "dosage", "dose"],
  sku: ["sku", "code", "itemcode", "productcode"],
  barcode: ["barcode", "ean", "upc", "scan"],
  unit: ["unit", "uom", "packaging"],
  category: ["category", "class", "group"],
  price: ["price", "srp", "sellingprice", "retail", "retailprice"],
  cost: ["cost", "unitcost", "buyingprice", "costprice"],
  quantity: ["quantity", "qty", "stock", "onhand", "openingstock"],
  expiry: ["expiry", "expiration", "expirydate", "exp", "expdate"],
  lotNumber: ["lot", "lotnumber", "batch", "batchnumber"],
  reorderPoint: ["reorder", "reorderpoint", "reorderlevel", "minimum", "min"],
  requiresPrescription: ["rx", "prescription", "requiresprescription", "isrx"],
};

function normaliseHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

/** Which CSV column index holds each field. -1 when the file has no such column. */
export function mapColumns(header: string[]): Record<string, number> {
  const seen = header.map(normaliseHeader);
  const out: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(ALIASES)) {
    out[field] = seen.findIndex((h) => aliases.includes(h));
  }
  return out;
}

export interface ImportRow {
  line: number;
  name: string;
  genericName: string | null;
  form: string | null;
  strength: string | null;
  sku: string | null;
  barcode: string | null;
  unit: string;
  category: string | null;
  priceCentavos: number;
  costCentavos: number;
  quantity: number;
  expiry: string | null;
  lotNumber: string | null;
  reorderPoint: number;
  requiresPrescription: boolean;
  /** What is wrong with this row. A row with problems is never imported. */
  problems: string[];
}

/** Pesos as typed → integer centavos. Handles "₱1,234.50" and "1234.5". */
export function toCentavos(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/**
 * A whole count, or null.
 *
 * DOES NOT STRIP THE DECIMAL POINT. An earlier version cleaned the string with
 * `replace(/[^0-9-]/g, "")`, which turns "12.5" into "125" — a fractional
 * quantity silently becoming ten times the stock. Thousands separators are
 * still removed, because "1,200" is one number written the way people write it.
 */
export function toWhole(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").replace(/\s/g, "").trim();
  if (cleaned === "") return null;
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isSafeInteger(n) ? n : null;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * An expiry date, in whatever form the supplier printed it.
 *
 * MONTH-ONLY BECOMES THE LAST DAY OF THAT MONTH, because that is what the pack
 * means: "EXP 06/2027" is good through the whole of June. Reading it as the 1st
 * writes off a month of saleable stock every time.
 *
 * A bare `new Date(raw)` is not acceptable here — it reads "03/04/2027" as
 * March in the US locale and April elsewhere, and a silently wrong expiry is
 * the one error this system exists to prevent.
 */
export function toExpiryIso(raw: string): string | null {
  const s = raw.trim();
  if (s === "") return null;

  // 2027-06-30 / 2027-06
  let m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(s);
  if (m) return iso(Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : undefined);

  // Jun 2027 / June 2027 / JUN-27
  m = /^([A-Za-z]{3,})[\s\-/]+(\d{2,4})$/.exec(s);
  if (m) {
    const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (month) return iso(fullYear(Number(m[2])), month, undefined);
  }

  // 06/2027 or 06-27  (month first, no day)
  m = /^(\d{1,2})[\s\-/](\d{2,4})$/.exec(s);
  if (m) {
    const month = Number(m[1]);
    if (month >= 1 && month <= 12) return iso(fullYear(Number(m[2])), month, undefined);
  }

  // 30/06/2027 — DAY FIRST. Philippine suppliers write d/m/y far more often
  // than m/d/y, and where the day is unambiguous (>12) we can tell for sure.
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(s);
  if (m) {
    let d = Number(m[1]);
    let mo = Number(m[2]);
    // If the first number cannot be a day, it was the month.
    if (d > 12 && mo <= 12) {
      /* d/m/y as read */
    } else if (mo > 12 && d <= 12) {
      [d, mo] = [mo, d];
    }
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return iso(fullYear(Number(m[3])), mo, d);
  }

  return null;
}

function fullYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

function iso(year: number, month: number, day?: number): string | null {
  if (month < 1 || month > 12) return null;
  // Day 0 of the next month is the last day of this one.
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const d = day ?? last;
  if (d < 1 || d > last) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function flag(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  return t === "yes" || t === "y" || t === "true" || t === "1" || t === "rx";
}

/** The header row this app writes when somebody asks for a template. */
export const TEMPLATE_HEADER = [
  "name",
  "generic",
  "form",
  "strength",
  "sku",
  "barcode",
  "unit",
  "category",
  "price",
  "cost",
  "quantity",
  "expiry",
  "lot",
  "reorder",
  "rx",
];

export interface ParsedFile {
  rows: ImportRow[];
  /** A problem with the FILE, as opposed to a row. Nothing is imported. */
  error: string | null;
}

/**
 * Turn a parsed grid into rows ready to import.
 *
 * EVERY ROW IS RETURNED, including the broken ones, with their problems
 * attached. An importer that silently drops the rows it could not read leaves
 * somebody comparing counts and guessing which twelve of four hundred went
 * missing.
 */
export function readImport(grid: string[][]): ParsedFile {
  if (grid.length === 0) return { rows: [], error: "That file is empty." };

  const cols = mapColumns(grid[0]!);
  if (cols.name === -1) {
    return {
      rows: [],
      error:
        "No product-name column found. The first row must be a header with a column called name, product or item.",
    };
  }

  const at = (row: string[], key: string): string => {
    const i = cols[key];
    return i === undefined || i < 0 ? "" : (row[i] ?? "").trim();
  };

  const rows: ImportRow[] = [];
  for (let r = 1; r < grid.length; r += 1) {
    const raw = grid[r]!;
    const problems: string[] = [];

    const name = at(raw, "name");
    if (name === "") problems.push("no product name");

    const priceRaw = at(raw, "price");
    const price = priceRaw === "" ? 0 : toCentavos(priceRaw);
    if (price === null) problems.push(`price "${priceRaw}" is not a number`);

    const costRaw = at(raw, "cost");
    const cost = costRaw === "" ? 0 : toCentavos(costRaw);
    if (cost === null) problems.push(`cost "${costRaw}" is not a number`);

    const qtyRaw = at(raw, "quantity");
    const qty = qtyRaw === "" ? 0 : toWhole(qtyRaw);
    if (qty === null) problems.push(`quantity "${qtyRaw}" is not a whole number`);

    const reorderRaw = at(raw, "reorderPoint");
    const reorder = reorderRaw === "" ? 0 : toWhole(reorderRaw);
    if (reorder === null) problems.push(`reorder point "${reorderRaw}" is not a whole number`);

    const expiryRaw = at(raw, "expiry");
    const expiry = expiryRaw === "" ? null : toExpiryIso(expiryRaw);
    if (expiryRaw !== "" && expiry === null) {
      problems.push(`expiry "${expiryRaw}" could not be read`);
    }

    // Opening stock with no cost would be a batch at zero — a 100% margin on
    // every future sale of it. Refused rather than guessed.
    if ((qty ?? 0) > 0 && (cost ?? 0) === 0) {
      problems.push("opening quantity given with no unit cost");
    }

    rows.push({
      line: r + 1,
      name,
      genericName: at(raw, "genericName") || null,
      form: at(raw, "form") || null,
      strength: at(raw, "strength") || null,
      sku: at(raw, "sku") || null,
      barcode: at(raw, "barcode") || null,
      unit: at(raw, "unit") || "piece",
      category: at(raw, "category") || null,
      priceCentavos: price ?? 0,
      costCentavos: cost ?? 0,
      quantity: qty ?? 0,
      expiry,
      lotNumber: at(raw, "lotNumber") || null,
      reorderPoint: reorder ?? 0,
      requiresPrescription: flag(at(raw, "requiresPrescription")),
      problems,
    });
  }

  return { rows, error: null };
}
