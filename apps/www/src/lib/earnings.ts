/**
 * What a partner would earn, and what it would take.
 *
 * The 30% is shown as plainly as the 70%. This page is read by people who have
 * been pitched at before, and a split that only names the good half is the
 * first thing they will notice — showing both is what makes the rest of the
 * page credible.
 *
 * Whole pesos. A subscription is priced in pesos, quoted in pesos, and the only
 * arithmetic here is a percentage of it.
 */

/** The partner's share of every monthly subscription. Not configurable. */
export const PARTNER_SHARE = 0.7;

export interface Earnings {
  merchants: number;
  monthlyPrice: number;
  /** Everything the merchants pay, per month. */
  grossMonthly: number;
  /** The partner's 70%. */
  partnerMonthly: number;
  /** CANVEXIA's 30%. Shown, not hidden. */
  hqMonthly: number;
  partnerYearly: number;
  /**
   * Businesses to visit to land this many.
   *
   * A flat 3× at the brief's instruction. It is an illustration of effort, not
   * a conversion rate anyone measured, and the copy says so — a number on this
   * page that pretends to be data is the thing the audience is scanning for.
   */
  visitsImplied: number;
}

export function earnings(merchants: number, monthlyPrice: number): Earnings {
  const m = Math.max(0, Math.floor(merchants));
  const price = Math.max(0, Math.floor(monthlyPrice));
  const gross = m * price;
  // Floor, not round: never quote a partner a peso more than they would get.
  const partner = Math.floor(gross * PARTNER_SHARE);
  return {
    merchants: m,
    monthlyPrice: price,
    grossMonthly: gross,
    partnerMonthly: partner,
    hqMonthly: gross - partner,
    partnerYearly: partner * 12,
    visitsImplied: m * 3,
  };
}

/** "₱20,979" — whole pesos, grouped, no decimals. */
export function peso(amount: number): string {
  return `₱${Math.round(amount).toLocaleString("en-PH")}`;
}
