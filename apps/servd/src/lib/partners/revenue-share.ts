/**
 * What a partner is owed, and which partners are owed anything at all.
 *
 * Pure — no database, no Prisma — so the rule that decides CANVEXIA's income can
 * be read in one screen and tested without a connection.
 *
 * THE GRANDFATHER LINE. The partner program that existed before CANVEXIA took no
 * cut and said so to the partners who signed it. Those partners keep those
 * terms. So "what is the split" is not a platform constant, it is a per-partner
 * field, and `tier` is what says which side of the line a row is on:
 *
 *   reseller / affiliate  legacy, zero cut, share must be 0
 *   operator              CANVEXIA city operator, share must be > 0
 *
 * The asymmetry is deliberate. A 0 on a legacy row is correct and must stay
 * writable. A 0 on an operator row is CANVEXIA earning nothing on that partner
 * forever, with nothing anywhere to say so — no error, no empty screen, just a
 * statement that quietly totals zero every month. That is the failure this file
 * exists to make impossible, which is why the check is on the way IN rather than
 * a report someone reads later.
 */

/** The standard CANVEXIA operator split: the partner keeps 70%. */
export const DEFAULT_OPERATOR_SHARE_PCT = 70;

export const LEGACY_TIERS = ["reseller", "affiliate"] as const;
export const OPERATOR_TIER = "operator";

export type PartnerTier = (typeof LEGACY_TIERS)[number] | typeof OPERATOR_TIER;

export function isLegacyTier(tier: string): boolean {
  return (LEGACY_TIERS as readonly string[]).includes(tier);
}

export function isOperatorTier(tier: string): boolean {
  return tier === OPERATOR_TIER;
}

export type ShareValidation = { ok: true } | { ok: false; error: string };

/**
 * Whether a (tier, share) pair may be saved.
 *
 * Call this before every partner create and update. Returning a message rather
 * than throwing keeps it usable directly as a form-action result.
 */
export function validateRevenueShare(input: {
  tier: string;
  revenueSharePct: number;
}): ShareValidation {
  const { tier, revenueSharePct: pct } = input;

  if (!Number.isInteger(pct)) {
    return { ok: false, error: "Revenue share must be a whole percentage." };
  }

  if (isLegacyTier(tier)) {
    if (pct !== 0) {
      return {
        ok: false,
        error:
          `A ${tier} partner is on the legacy zero-cut agreement and cannot carry a ` +
          `revenue share. Move them to the "${OPERATOR_TIER}" tier first — that is a ` +
          `change to the terms they signed, not a settings change.`,
      };
    }
    return { ok: true };
  }

  if (isOperatorTier(tier)) {
    if (pct <= 0) {
      return {
        ok: false,
        error:
          "A CANVEXIA operator must have a revenue share above 0%. Leaving it at 0 " +
          "means CANVEXIA earns nothing from this partner, and nothing would " +
          "surface to say so.",
      };
    }
    if (pct >= 100) {
      return {
        ok: false,
        error: "A revenue share of 100% or more leaves CANVEXIA nothing. Use 1–99.",
      };
    }
    return { ok: true };
  }

  return { ok: false, error: `Unknown partner tier "${tier}".` };
}

/**
 * Split a merchant's charge between partner and HQ.
 *
 * Integer centavos in, integer centavos out, and the two always sum back to the
 * input: HQ takes the remainder rather than its own rounded percentage, so a
 * rounding centavo can never go missing or be paid twice.
 */
export function splitRevenue(
  amountCentavos: number,
  revenueSharePct: number,
): { partner: number; hq: number } {
  if (!Number.isInteger(amountCentavos) || amountCentavos < 0) {
    throw new Error("splitRevenue: amount must be a non-negative integer (centavos)");
  }
  const partner = Math.round((amountCentavos * revenueSharePct) / 100);
  return { partner, hq: amountCentavos - partner };
}
