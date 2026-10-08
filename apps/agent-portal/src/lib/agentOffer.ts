/**
 * The agent offer, as shown on the public landing page.
 *
 * One place for every number a visitor reads, so the hero, the three
 * commission cards, the calculator and the FAQ can never drift apart. Money is
 * integer centavos, like everywhere else in the portal.
 *
 * These mirror the commission rule seeded for each product and the portal
 * settings (`payout_day_of_month`, `payout_minimum_amount`). They are a copy
 * for marketing, not the source of truth: what an agent is actually paid comes
 * from the rule pinned to each referral. If an admin changes a product's rule,
 * change these too.
 */
export const AGENT_OFFER = {
  /** Paid once, when the customer's activation payment is confirmed. */
  activationCommission: 50_000,
  /** Paid for each of the first `tier1Months` months the customer pays. */
  tier1Amount: 20_000,
  tier1Months: 6,
  /** Paid for every paid month after that. */
  tier2Amount: 10_000,

  /** What the customer pays. */
  customerActivationFee: 50_000,
  customerMonthlyFee: 80_000,

  /** Payouts. */
  payoutDayOfMonth: 15,
  payoutMinimum: 50_000,
} as const;

/** What one client is worth across their first `tier1Months` paid months. */
export const FIRST_SIX_MONTHS_PER_CLIENT =
  AGENT_OFFER.activationCommission + AGENT_OFFER.tier1Amount * AGENT_OFFER.tier1Months;

/** The calculator's slider. */
export const CALCULATOR = {
  minClients: 1,
  maxClients: 20,
  defaultClients: 5,
  /** The months shown as results. */
  months: [1, 6, 12],
} as const;

/**
 * What an agent earns IN month `month`, having signed up `newClientsPerMonth`
 * new clients every month since the start — not a running total.
 *
 * That month's own new clients pay the activation commission. Clients from the
 * last `tier1Months` cohorts are still on the higher monthly rate; everyone
 * older is on the lower one.
 */
export function monthlyEarnings(newClientsPerMonth: number, month: number): number {
  const n = newClientsPerMonth;
  const { activationCommission, tier1Amount, tier1Months, tier2Amount } = AGENT_OFFER;
  return (
    n * activationCommission +
    tier1Amount * n * Math.min(month, tier1Months) +
    tier2Amount * n * Math.max(month - tier1Months, 0)
  );
}
