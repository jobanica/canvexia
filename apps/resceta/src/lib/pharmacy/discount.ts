/**
 * Senior Citizen and PWD pricing.
 *
 * This is statute, not a pricing policy, and getting it wrong is a compliance
 * failure rather than a rounding complaint. RA 9994 (Expanded Senior Citizens
 * Act) and RA 10754 (for PWDs) both give the same entitlement on medicines:
 *
 *   the 20% discount is taken on the VAT-EXCLUSIVE price, and the sale is
 *   exempt from VAT
 *
 * Which is why this is NOT `price * 0.8`. On a VAT-inclusive shelf price the
 * beneficiary pays:
 *
 *   net = (price / 1.12) * 0.8
 *
 * — the VAT comes off first, then the 20%. `price * 0.8` overcharges by about
 * 9.6% of the shelf price on every line, quietly, forever. Derived from the
 * working implementation in jobanica/Pharmacy rather than from memory.
 *
 * The VAT rate is a parameter, not a constant, because it lives on the merchant
 * (Pharmacy.vatRatePct): a statutory rate change must not require a code
 * change to a statutory calculation.
 *
 * Everything is centavos, integer. Money is never a float here.
 */

export type DiscountType = "none" | "manual" | "sc" | "pwd";

/** The statutory rate. Both RA 9994 and RA 10754 give 20%. */
const STATUTORY_RATE = 0.2;

export function isStatutory(type: DiscountType): type is "sc" | "pwd" {
  return type === "sc" || type === "pwd";
}

/**
 * What one line's discount comes to for an SC/PWD sale.
 *
 * Rounds the NET to the nearest centavo and derives the discount from it,
 * rather than rounding the discount. The receipt shows what the customer pays;
 * that is the number that has to be a whole centavo, and the discount is the
 * remainder.
 */
export function statutoryLineDiscount(
  unitPriceCentavos: number,
  quantity: number,
  vatRatePct: number,
): number {
  if (unitPriceCentavos <= 0 || quantity <= 0) return 0;
  const vatExclusive = unitPriceCentavos / (1 + vatRatePct / 100);
  const net = Math.round(vatExclusive * (1 - STATUTORY_RATE));
  return (unitPriceCentavos - net) * quantity;
}

export interface SaleLineInput {
  unitPriceCentavos: number;
  quantity: number;
}

export interface SaleTotals {
  subtotalCentavos: number;
  discountCentavos: number;
  totalCentavos: number;
  /** An SC/PWD sale is VAT-exempt in full. Zero otherwise. */
  vatExemptCentavos: number;
}

/**
 * Total a sale.
 *
 * A manual discount is capped at the subtotal, and so is the statutory one —
 * not because the statutory sum can exceed it (it cannot) but because a cap
 * that only sometimes applies is a cap someone will remove.
 */
export function totalSale(
  lines: SaleLineInput[],
  opts: {
    discountType: DiscountType;
    vatRatePct: number;
    /** Centavos, for discountType "manual". Ignored otherwise. */
    manualDiscountCentavos?: number;
  },
): SaleTotals {
  const subtotal = lines.reduce(
    (sum, l) => sum + l.unitPriceCentavos * l.quantity,
    0,
  );

  let discount: number;
  if (isStatutory(opts.discountType)) {
    discount = lines.reduce(
      (sum, l) =>
        sum + statutoryLineDiscount(l.unitPriceCentavos, l.quantity, opts.vatRatePct),
      0,
    );
  } else if (opts.discountType === "manual") {
    discount = Math.max(0, opts.manualDiscountCentavos ?? 0);
  } else {
    discount = 0;
  }
  discount = Math.min(discount, subtotal);

  const total = subtotal - discount;
  return {
    subtotalCentavos: subtotal,
    discountCentavos: discount,
    totalCentavos: total,
    // Exempt in full, and on the TOTAL rather than the subtotal: the exempt
    // figure on the BIR return is what the customer actually paid.
    vatExemptCentavos: isStatutory(opts.discountType) ? total : 0,
  };
}
