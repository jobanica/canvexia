/**
 * Finding a product at the counter, and settling the bill.
 *
 * Pure and dependency-free, because this is the arithmetic and the matching a
 * till gets wrong in front of a customer — and none of it needs a database to
 * prove.
 *
 * WHY SEARCH EXISTS AT ALL. The counter used to render every product as a row
 * with plus and minus buttons. That is fine for the forty products a demo has
 * and impossible for the 1,886 a real pharmacy imported on its first morning:
 * nobody scrolls two thousand rows while somebody waits with a prescription.
 */

export interface SearchableProduct {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  genericName: string | null;
  onHand: number;
}

const norm = (v: string | null | undefined): string => (v ?? "").trim().toLowerCase();

/**
 * A BARCODE SCANNER IS A KEYBOARD that types fast and presses Enter.
 *
 * So there is no separate scan mode: whatever is in the box when Enter is
 * pressed is tried as an identifier first. Identifiers only — barcode, then
 * SKU. A name is never an exact match here, because "Biogesic" matching one of
 * four Biogesics and adding it silently is how the wrong strength gets sold.
 */
export function scanMatch<T extends SearchableProduct>(products: T[], code: string): T | null {
  const needle = norm(code);
  if (!needle) return null;
  return (
    products.find((p) => norm(p.barcode) === needle) ??
    products.find((p) => norm(p.sku) === needle) ??
    null
  );
}

/**
 * Ranked search over name, generic name, SKU and barcode.
 *
 * RANKED, not merely filtered: a cashier typing "amox" wants the products whose
 * NAME starts with it before the ones that merely contain it somewhere, and an
 * exact identifier above everything. `limit` exists because rendering two
 * thousand tiles on every keystroke is how the search box comes to feel broken.
 *
 * OUT OF STOCK SORTS LAST but is never hidden. A cashier needs to see that the
 * shop has the product and it has run out — that is the answer to the customer's
 * question, and a missing tile looks like the pharmacy never carried it.
 */
export function searchProducts<T extends SearchableProduct>(
  products: T[],
  query: string,
  limit = 60,
): T[] {
  const needle = norm(query);
  if (!needle) {
    return [...products]
      .sort((a, b) => Number(b.onHand > 0) - Number(a.onHand > 0) || a.name.localeCompare(b.name))
      .slice(0, limit);
  }

  const scored: { p: T; score: number }[] = [];
  for (const p of products) {
    const name = norm(p.name);
    const generic = norm(p.genericName);
    const sku = norm(p.sku);
    const barcode = norm(p.barcode);

    let score = -1;
    if (barcode === needle || sku === needle) score = 0;
    else if (name.startsWith(needle)) score = 1;
    else if (generic.startsWith(needle)) score = 2;
    else if (sku.startsWith(needle) || barcode.startsWith(needle)) score = 3;
    else if (name.includes(needle)) score = 4;
    else if (generic.includes(needle)) score = 5;
    if (score < 0) continue;

    // Out of stock keeps its rank within the group but falls behind every
    // in-stock match, rather than disappearing.
    scored.push({ p, score: score + (p.onHand > 0 ? 0 : 10) });
  }

  scored.sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name));
  return scored.slice(0, limit).map((s) => s.p);
}

export interface Tender {
  method: string;
  amountCentavos: number;
}

/**
 * WHAT THE CASHIER TYPED → centavos.
 *
 * REPORTED — "I cannot type the cash amount paid to me."
 *
 * The amount box held centavos and re-rendered `(centavos / 100).toFixed(2)` on
 * every keystroke. Typing "5" became "5.00"; the next digit made "5.000", which
 * parses back to 5 and re-renders as "5.00". The field was permanently stuck on
 * its first digit and the sale could never be completed.
 *
 * The lesson is the rule, not the patch: A MONEY FIELD KEEPS THE TEXT THE
 * PERSON TYPED and derives the number from it. Formatting mid-typing fights the
 * person doing the typing — and this is the field that decides what a customer
 * is charged.
 *
 * Forgiving about how money gets typed: "1,200.50", "₱500" and " 500 " are all
 * the same amount to a cashier in a hurry, so they are the same amount here.
 * Anything unparseable is zero rather than NaN, because NaN propagates into the
 * change calculation and a till must never display a change of "NaN".
 */
export function amountToCentavos(text: string): number {
  const cleaned = text.replace(/[^0-9.]/g, "");
  if (cleaned === "") return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

/** What has been handed over. */
export function tenderedTotal(tenders: Tender[]): number {
  return tenders.reduce((sum, t) => sum + (t.amountCentavos > 0 ? t.amountCentavos : 0), 0);
}

/**
 * Change owed, never negative.
 *
 * A negative "change" is a shortfall wearing the wrong label, and a cashier
 * reading -₱50 as change is a cashier opening the drawer. Short is the caller's
 * question to ask with `shortfall`.
 */
export function changeFor(dueCentavos: number, tenders: Tender[]): number {
  return Math.max(0, tenderedTotal(tenders) - dueCentavos);
}

/** What is still owed. Zero once the bill is covered. */
export function shortfall(dueCentavos: number, tenders: Tender[]): number {
  return Math.max(0, dueCentavos - tenderedTotal(tenders));
}

/**
 * The payment methods a Philippine counter actually takes.
 *
 * `cash` is first because it is the overwhelming default and the one the till
 * opens for.
 */
export const TENDER_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "gcash", label: "GCash" },
  { value: "maya", label: "Maya" },
  { value: "card", label: "Card" },
] as const;
