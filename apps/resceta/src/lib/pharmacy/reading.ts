/**
 * The arithmetic on an X or Z reading.
 *
 * PRICES IN THE PHILIPPINES ARE VAT-INCLUSIVE. The shelf label is what the
 * customer pays, and the VAT is backed OUT of it — so a 12% rate means the tax
 * is `total × 12/112`, not `total × 12/100`. Getting that backwards overstates
 * the VAT by about 12% of itself on every return, which is the kind of error
 * that is only ever found by an assessment.
 *
 * AN SC/PWD SALE IS EXEMPT IN FULL. The exempt portion is recorded on the sale
 * when it is rung up; it is removed from the VAT-able base here rather than
 * being taxed and then credited, because that is what the return asks for.
 *
 * Pure and dependency-free: this is the sheet a pharmacy hands the BIR, and it
 * should be testable without a database.
 */

export interface ReadingSale {
  subtotalCentavos: number;
  discountCentavos: number;
  totalCentavos: number;
  vatExemptCentavos: number;
  paymentMethod: string;
  status: string;
  receiptNumber: string;
}

export interface ReadingTotals {
  salesCount: number;
  voidedCount: number;
  /** Before discount. */
  grossCentavos: number;
  discountCentavos: number;
  /** What was actually charged — the sum of the receipts. */
  netCentavos: number;

  /** The VAT-able base, NET of the VAT itself. */
  vatableCentavos: number;
  vatCentavos: number;
  vatExemptCentavos: number;
  zeroRatedCentavos: number;

  cashCentavos: number;
  cardCentavos: number;
  gcashCentavos: number;
  mayaCentavos: number;
  otherCentavos: number;

  firstReceiptNumber: string | null;
  lastReceiptNumber: string | null;
}

export function readingTotals(sales: ReadingSale[], vatRatePct: number): ReadingTotals {
  // A VOIDED SALE IS NOT A SALE. It is counted — the BIR wants to see how many
  // were voided — and it contributes nothing to any money figure.
  const live = sales.filter((s) => s.status === "completed");
  const voided = sales.length - live.length;

  const netCentavos = live.reduce((t, s) => t + s.totalCentavos, 0);
  const vatExemptCentavos = live.reduce((t, s) => t + s.vatExemptCentavos, 0);

  // The VAT-inclusive portion: everything charged that was not exempt. Floored
  // at zero, because an exempt figure larger than the total is a data error and
  // a negative tax base is a worse answer than zero.
  const vatInclusive = Math.max(0, netCentavos - vatExemptCentavos);
  const vatCentavos =
    vatRatePct > 0 ? Math.round((vatInclusive * vatRatePct) / (100 + vatRatePct)) : 0;

  const tender = (method: string) =>
    live.filter((s) => s.paymentMethod === method).reduce((t, s) => t + s.totalCentavos, 0);

  const known = ["cash", "card", "gcash", "maya"];
  const numbers = live.map((s) => s.receiptNumber).sort();

  return {
    salesCount: live.length,
    voidedCount: voided,
    grossCentavos: live.reduce((t, s) => t + s.subtotalCentavos, 0),
    discountCentavos: live.reduce((t, s) => t + s.discountCentavos, 0),
    netCentavos,
    vatableCentavos: vatInclusive - vatCentavos,
    vatCentavos,
    vatExemptCentavos,
    // Nothing in this app is zero-rated yet (that is an export sale). The line
    // is on the reading because the BIR form has it, and a form with a missing
    // line is harder to file than one with a zero.
    zeroRatedCentavos: 0,
    cashCentavos: tender("cash"),
    cardCentavos: tender("card"),
    gcashCentavos: tender("gcash"),
    mayaCentavos: tender("maya"),
    // Anything the payment field holds that is not one of the four. Better a
    // visible "other" than a reading whose tenders silently do not add up to
    // the net.
    otherCentavos: live
      .filter((s) => !known.includes(s.paymentMethod))
      .reduce((t, s) => t + s.totalCentavos, 0),
    firstReceiptNumber: numbers[0] ?? null,
    lastReceiptNumber: numbers[numbers.length - 1] ?? null,
  };
}

/**
 * What the drawer should hold.
 *
 * Opening float plus cash taken. CARD AND E-WALLET SALES ARE NOT IN THE DRAWER,
 * which is the entire reason the tender breakdown exists — reconciling a drawer
 * against the day's total shows every GCash sale as a shortage.
 */
export function expectedCash(openingCentavos: number, cashCollectedCentavos: number): number {
  return openingCentavos + cashCollectedCentavos;
}

/** Counted less expected. Negative is short, positive is over. */
export function overShort(countedCentavos: number, expectedCentavos: number): number {
  return countedCentavos - expectedCentavos;
}
