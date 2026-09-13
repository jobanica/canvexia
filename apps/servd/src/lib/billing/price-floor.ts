/**
 * The least a plan may be sold for.
 *
 * Pure — money in centavos as integers, no database — so the rule can be applied
 * identically in two places that are otherwise nothing alike: HQ editing a plan's
 * own price (Phase 2), and a partner setting their price for that plan in the
 * portal (Phase 3). Two implementations of "is this above the floor" is one
 * implementation and one loophole.
 *
 * WHY A FLOOR AT ALL. Partners set their own prices, and merchants in different
 * cities talk to each other. Without a floor, an operator undercutting a
 * neighbour does not just start a price war between them: CANVEXIA's 30% is a
 * share of what was actually charged, so the race to the bottom comes out of
 * HQ's revenue at the same rate. The floor is the platform declining to fund
 * that.
 */

import { formatPeso } from "@/lib/money";

/** A floor of 0 means the plan is unrestricted. */
export const NO_FLOOR = 0;

export type PriceCheck = { ok: true } | { ok: false; error: string };

/**
 * Whether `priceMonthly` may be charged for a plan whose floor is `priceFloor`.
 *
 * Both in centavos. A free plan (0) is allowed under any floor on purpose — the
 * Free Starter tier is how merchants get in the door, and a floor is a rule
 * about what you may *sell* for, not a ban on giving something away.
 */
export function validatePriceAgainstFloor(input: {
  priceMonthly: number;
  priceFloor: number;
}): PriceCheck {
  const { priceMonthly, priceFloor } = input;

  if (!Number.isInteger(priceMonthly) || priceMonthly < 0) {
    return { ok: false, error: "Price must be a whole number of centavos, and not negative." };
  }
  if (!Number.isInteger(priceFloor) || priceFloor < 0) {
    return { ok: false, error: "Price floor must be a whole number of centavos, and not negative." };
  }

  if (priceFloor === NO_FLOOR) return { ok: true };
  if (priceMonthly === 0) return { ok: true }; // a free plan is not a discount

  if (priceMonthly < priceFloor) {
    return {
      ok: false,
      error:
        `${formatPeso(priceMonthly)} is below the floor of ${formatPeso(priceFloor)} for this plan. ` +
        `Raise the price, or lower the floor if the floor is the thing that is wrong.`,
    };
  }

  return { ok: true };
}

/**
 * Whether HQ may set this floor, given what the plan currently charges.
 *
 * Guards the direction people actually get wrong: raising a floor above the
 * plan's own price leaves the platform's default price illegal under its own
 * rule, and nothing would say so until the next person tried to save the plan
 * and got an error about a number they had not touched.
 */
export function validateFloorAgainstPrice(input: {
  priceFloor: number;
  priceMonthly: number;
}): PriceCheck {
  const { priceFloor, priceMonthly } = input;

  if (!Number.isInteger(priceFloor) || priceFloor < 0) {
    return { ok: false, error: "Price floor must be a whole number of centavos, and not negative." };
  }
  if (priceFloor === NO_FLOOR) return { ok: true };

  if (priceMonthly > 0 && priceFloor > priceMonthly) {
    return {
      ok: false,
      error:
        `A floor of ${formatPeso(priceFloor)} is above this plan's own price of ` +
        `${formatPeso(priceMonthly)}, which would make the platform's default price invalid. ` +
        `Raise the price first.`,
    };
  }

  return { ok: true };
}
