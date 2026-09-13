/**
 * Who carries "Powered by Servd" on their customer-facing pages.
 *
 * Two independent rules, and they answer different questions:
 *
 *   - GRANDFATHERING. Restaurants that were already trading when the badge was
 *     introduced don't get it added to their site. They signed up without it,
 *     their customers know their page without it, and quietly stamping a
 *     supplier's name on somebody's storefront after the fact is not a change
 *     to spring on a paying customer. The line is a date, not a flag, so it
 *     covers every way an account can come into existence — signup, a partner
 *     converting a demo, the owner adding a branch — without any of them having
 *     to remember to set something.
 *
 *   - WHITE-LABEL. Anyone who has bought the full white-label unlock has paid
 *     for exactly this to be gone, so it goes, whenever they signed up.
 *
 * The QR/table splash is older and already showed for everyone, so it is NOT
 * grandfathered — nothing is being added to an existing account there. It only
 * answers the white-label question, which until now it never asked at all.
 */

/**
 * Accounts created from this moment carry the badge; everyone older is
 * grandfathered. Manila time, written as an explicit offset so the boundary
 * doesn't move with the server's timezone.
 */
export const POWERED_BY_SINCE = "2026-08-21T00:00:00+08:00";

function createdOnOrAfterCutoff(createdAt: Date | string | null | undefined): boolean {
  if (!createdAt) return false; // can't date it → don't brand it
  const ms = createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt);
  if (Number.isNaN(ms)) return false;
  return ms >= Date.parse(POWERED_BY_SINCE);
}

export interface BrandingInput {
  /** When the restaurant account was created. */
  createdAt: Date | string | null | undefined;
  /** Owns the full white-label unlock. */
  ownsWhiteLabel: boolean;
}

export interface ServdBranding {
  /** The "Powered by Servd · www.servdph.com" line under the ordering page and the QR menu. */
  showFooter: boolean;
  /** The full-screen Servd splash after a QR scan. */
  showSplash: boolean;
}

export function servdBranding({ createdAt, ownsWhiteLabel }: BrandingInput): ServdBranding {
  if (ownsWhiteLabel) return { showFooter: false, showSplash: false };
  return { showFooter: createdOnOrAfterCutoff(createdAt), showSplash: true };
}

/** What nothing-is-branded looks like — the answer whenever the lookup fails. */
export const NO_SERVD_BRANDING: ServdBranding = { showFooter: false, showSplash: true };
