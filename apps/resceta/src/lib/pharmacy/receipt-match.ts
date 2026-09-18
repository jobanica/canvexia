import { normaliseName } from "./duplicates";

/**
 * MATCHING A SCANNED LINE TO A PRODUCT IN THE CATALOGUE.
 *
 * The receipt says "BIOGESIC 500MG TAB"; the catalogue says "Biogesic 500mg".
 * Something has to join them, and what that something is allowed to do is the
 * whole safety question on this screen — a wrong match books a delivery of one
 * medicine onto another's shelf, and the stock record is then wrong for both.
 *
 * SO THERE ARE THREE CONFIDENCES AND ONLY ONE OF THEM IS AUTOMATIC:
 *
 *   exact   — identical once case, spacing and unit spelling are normalised.
 *             Pre-selected in the form.
 *   likely  — one contains the other as a whole-word prefix ("Biogesic 500mg"
 *             vs "Biogesic 500mg Tab"). SUGGESTED, never pre-selected: the
 *             person has to choose it.
 *   none    — nothing close. The line waits for a product to be picked, or for
 *             a new one to be created.
 *
 * There is no edit-distance or token-overlap scoring. "Amoxicillin 250mg" and
 * "Amoxicillin 500mg" are one character apart and are different medicines.
 */

export interface MatchableProduct {
  id: string;
  name: string;
  genericName: string | null;
}

export type MatchConfidence = "exact" | "likely" | "none";

export interface LineMatch {
  productId: string | null;
  confidence: MatchConfidence;
}

/** Whole-word prefix: "biogesic 500mg" is inside "biogesic 500mg tab". */
function prefixes(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 4) return false;
  return long.startsWith(`${short} `);
}

export function matchLine(
  scannedName: string,
  products: MatchableProduct[],
): LineMatch {
  const needle = normaliseName(scannedName);
  if (!needle) return { productId: null, confidence: "none" };

  const exact = products.find((p) => normaliseName(p.name) === needle);
  if (exact) return { productId: exact.id, confidence: "exact" };

  // A generic name is a weaker claim than a brand name — "Paracetamol" matches
  // a dozen products — so it only counts when it is an exact hit and unique.
  const byGeneric = products.filter(
    (p) => p.genericName && normaliseName(p.genericName) === needle,
  );
  if (byGeneric.length === 1) return { productId: byGeneric[0]!.id, confidence: "likely" };

  const near = products.filter((p) => prefixes(normaliseName(p.name), needle));
  // Ambiguous is NOT a match. Two candidates means a person picks.
  if (near.length === 1) return { productId: near[0]!.id, confidence: "likely" };

  return { productId: null, confidence: "none" };
}

export interface ScannedLine {
  productName: string;
  genericName: string | null;
  quantity: number;
  unitCostCentavos: number;
  expiryDate: string | null;
  lotNumber: string | null;
}

export interface MatchedLine extends ScannedLine {
  match: LineMatch;
  /** Everything the form needs before it can be received. */
  blockers: string[];
}

/**
 * What still stops a line being received.
 *
 * A LINE WITH BLOCKERS IS NOT SENT. The quantity and the cost are the two
 * numbers a photo most often fails to read, and booking a zero of either is a
 * batch that says a delivery was free or empty.
 */
export function blockersFor(line: ScannedLine, match: LineMatch): string[] {
  const out: string[] = [];
  if (!match.productId) out.push("no product chosen");
  if (line.quantity <= 0) out.push("quantity not read");
  if (line.unitCostCentavos <= 0) out.push("unit cost not read");
  return out;
}

export function matchAll(lines: ScannedLine[], products: MatchableProduct[]): MatchedLine[] {
  return lines.map((line) => {
    const match = matchLine(line.productName, products);
    return { ...line, match, blockers: blockersFor(line, match) };
  });
}
