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
  /**
   * The owning partner's contracted brand mode: "powered_by" | "full_whitelabel".
   *
   * Optional, and absent means "powered_by" — which is what makes every existing
   * caller and every existing account behave exactly as it did.
   */
  partnerBrandMode?: string | null;
}

export interface ServdBranding {
  /** The "Powered by Servd" line under the ordering page and the QR menu. */
  showFooter: boolean;
  /** The full-screen Servd splash after a QR scan. */
  showSplash: boolean;
}

export function servdBranding({
  createdAt,
  ownsWhiteLabel,
  partnerBrandMode,
}: BrandingInput): ServdBranding {
  // TWO SYSTEMS, ONE QUESTION. A merchant can buy the white-label unlock, and
  // their partner can be contracted to full white-label. Either one removes the
  // badge; neither can put it back.
  //
  // The direction is not arbitrary. A merchant who PAID for the badge to be gone
  // has bought exactly that, so a partner term cannot reinstate it. A partner on
  // full white-label has contracted for no CANVEXIA mention anywhere their
  // customers can see, so a merchant who never bought the unlock cannot expose
  // it on their behalf. Both point the same way, and "either suppresses" is the
  // only rule that keeps both promises.
  if (ownsWhiteLabel || partnerBrandMode === "full_whitelabel") {
    return { showFooter: false, showSplash: false };
  }
  return { showFooter: createdOnOrAfterCutoff(createdAt), showSplash: true };
}

/** What nothing-is-branded looks like — the answer whenever the lookup fails. */
export const NO_SERVD_BRANDING: ServdBranding = { showFooter: false, showSplash: true };
