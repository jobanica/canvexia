/**
 * FINDING THE SAME MEDICINE ENTERED TWICE.
 *
 * It happens because receiving lets a delivery create a product inline: two
 * people typing "Biogesic 500mg" and "BIOGESIC 500 MG" on different days end up
 * with two products, two sets of batches, and a low-stock alert that never
 * fires because neither half is ever below the reorder point on its own.
 *
 * THE MATCH IS DELIBERATELY CONSERVATIVE. A false positive here merges two
 * genuinely different medicines — different strengths of the same molecule, say
 * — and that is a dispensing error waiting to happen, not a tidy-up. So this
 * groups only on an EXACT match after normalising punctuation and spacing, or
 * on a shared SKU or barcode, which are identifiers rather than descriptions.
 * Fuzzy matching (edit distance, token overlap) is deliberately absent: it
 * would catch more and it would eventually catch something it should not.
 *
 * Pure, so the rule can be tested exhaustively without a database.
 */

export interface DuplicateCandidate {
  id: string;
  name: string;
  genericName: string | null;
  form: string | null;
  strength: string | null;
  sku: string | null;
  barcode: string | null;
  priceCentavos: number;
  onHand: number;
  isActive: boolean;
  createdAt: Date;
}

export interface DuplicateGroup {
  /** What made these look like the same product. Shown to whoever decides. */
  reason: "name" | "sku" | "barcode";
  key: string;
  members: DuplicateCandidate[];
}

/**
 * Casefold, collapse whitespace, drop punctuation, and normalise the units that
 * are written three ways: "500 MG", "500mg" and "500-mg" are one strength.
 */
export function normaliseName(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    // "500 mg" -> "500mg" before punctuation goes, so the number keeps its unit.
    .replace(/(\d)\s*(mg|mcg|g|ml|l|iu|%)\b/g, "$1$2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** The whole identity of a product for matching: name plus what it is. */
export function productKey(p: DuplicateCandidate): string {
  return [p.name, p.strength ?? "", p.form ?? ""].map(normaliseName).join("|");
}

/**
 * Group products that look like the same thing.
 *
 * ONE GROUP PER PRODUCT, and a product already grouped by SKU is not grouped
 * again by name — otherwise the same three rows appear twice on the screen and
 * merging one group leaves the other stale.
 */
export function findDuplicates(products: DuplicateCandidate[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const claimed = new Set<string>();

  const byExact = (
    reason: DuplicateGroup["reason"],
    keyOf: (p: DuplicateCandidate) => string | null,
  ) => {
    const buckets = new Map<string, DuplicateCandidate[]>();
    for (const p of products) {
      if (claimed.has(p.id)) continue;
      const key = keyOf(p);
      if (!key) continue;
      (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(p);
    }
    for (const [key, members] of buckets) {
      if (members.length < 2) continue;
      for (const m of members) claimed.add(m.id);
      groups.push({ reason, key, members: [...members].sort(byKeepPreference) });
    }
  };

  // Identifiers first: a shared barcode is a much stronger claim than a shared
  // name, and it should be the reason shown when both are true.
  byExact("barcode", (p) => (p.barcode?.trim() ? p.barcode.trim().toLowerCase() : null));
  byExact("sku", (p) => (p.sku?.trim() ? p.sku.trim().toLowerCase() : null));
  byExact("name", (p) => (p.name.trim() ? productKey(p) : null));

  return groups;
}

/**
 * Which row to keep, by default.
 *
 * THE ONE WITH STOCK, then the one with an identifier, then the oldest. Keeping
 * the empty one means moving every batch, which is more work for the database
 * and more to go wrong; keeping the newest throws away the product the sales
 * history already points at.
 */
export function byKeepPreference(a: DuplicateCandidate, b: DuplicateCandidate): number {
  if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
  if (a.onHand !== b.onHand) return b.onHand - a.onHand;
  const idA = (a.barcode ? 2 : 0) + (a.sku ? 1 : 0);
  const idB = (b.barcode ? 2 : 0) + (b.sku ? 1 : 0);
  if (idA !== idB) return idB - idA;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

/** The row this app suggests keeping. Whoever merges can pick another. */
export function suggestedKeeper(group: DuplicateGroup): DuplicateCandidate {
  return group.members[0]!;
}
