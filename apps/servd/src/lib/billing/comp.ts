/** Complimentary ("full access, no payment") helpers — shared, framework-free. */

/**
 * Sentinel "no end date" for open-ended complimentary access. Far beyond any
 * real comp (max 1 year out) but a safe, ordinary timestamp value.
 */
export const COMP_FOREVER = new Date("2099-12-31T00:00:00.000Z");

/** Is this trial-end date our open-ended complimentary sentinel? */
export function isComplimentary(trialEndsAt: string | Date | null): boolean {
  if (!trialEndsAt) return false;
  return new Date(trialEndsAt).getUTCFullYear() >= 2090;
}
