/**
 * Monthly online-order caps per plan. Infinity = unlimited.
 *
 * `lite` is a HIDDEN save offer (300 orders/mo) assigned only via super-admin
 * override — never advertised in the UI, never priced in the UI. See the plan
 * banner for the visibility rules.
 */
export const ORDER_CAP: Record<string, number> = {
  starter: 100,
  lite: 300,
  trial: Infinity,
  growth: Infinity,
  legacy: Infinity,
};

/** The monthly order cap for a plan (defaults to the Free/starter cap of 100). */
export const capFor = (plan: string): number => ORDER_CAP[plan] ?? 100;
