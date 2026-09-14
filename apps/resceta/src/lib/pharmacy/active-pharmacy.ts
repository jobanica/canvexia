/**
 * Which pharmacy a session is currently looking at.
 *
 * One login can be staff at more than one pharmacy — an owner with two
 * branches, a relief pharmacist covering both. `pharmacy_staff` is unique on
 * (pharmacyId, authUserId), not on authUserId, so this is a real case rather
 * than a hypothetical.
 *
 * The browser asks via a cookie; this decides. The cookie is a REQUEST, never a
 * fact: it is checked against the memberships read from the database, and one
 * naming a pharmacy the person is not staff at is ignored rather than honoured.
 * That is the whole reason this is a function and not `cookie ?? first`.
 *
 * Pure, so the precedence can be tested without a browser.
 */

export const PHARMACY_COOKIE = "resceta_pharmacy";

export interface Membership {
  pharmacyId: string;
  /** ISO string. Oldest membership wins when nothing else decides. */
  createdAt: string;
  /** Whether that pharmacy may currently dispense. */
  active: boolean;
}

/**
 * Precedence: a valid request, then the oldest ACTIVE pharmacy, then the
 * oldest of any.
 *
 * Oldest rather than newest because the first pharmacy someone was added to is
 * the one they work at; a second membership is usually the new branch or a
 * cover shift. Falling through to an inactive one last means a pending
 * pharmacy does not strand someone in a dashboard that cannot dispense while
 * they also have a live one.
 */
export function pickPharmacy(
  memberships: readonly Membership[],
  requested: string | null,
): string | null {
  if (memberships.length === 0) return null;

  if (requested) {
    const asked = memberships.find((m) => m.pharmacyId === requested);
    if (asked) return asked.pharmacyId;
    // Not a member. Fall through rather than erroring: a stale cookie from a
    // membership that was removed should log you into your remaining pharmacy,
    // not lock you out of the app.
  }

  const byAge = [...memberships].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return (byAge.find((m) => m.active) ?? byAge[0]).pharmacyId;
}
