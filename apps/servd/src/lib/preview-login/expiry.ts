/**
 * Temporary logins for demo storefronts.
 *
 * A demo is pitched by handing someone a phone: they scan the QR, order, and
 * watch it land on the merchant screen. That needs a login, and a login left
 * behind on a storefront a real restaurant later takes over is a genuine
 * problem, not an untidiness — so these expire on their own.
 *
 * Pure, and separate from the queries, because the one rule that matters is
 * arithmetic: an expired login must stop working. The session layer enforces it
 * on every request rather than trusting a cleanup job to have run.
 */

/** How long a freshly-issued preview login lasts. */
export const PREVIEW_LOGIN_DAYS = 7;

const DAY_MS = 86_400_000;

/** When a login issued now should stop working. */
export function previewExpiryFrom(now: Date = new Date(), days = PREVIEW_LOGIN_DAYS): Date {
  return new Date(now.getTime() + days * DAY_MS);
}

/**
 * Is this staff row a temporary preview login?
 *
 * Carrying an expiry is the whole definition. Every real staff account has NULL
 * here, including every one that existed before this feature.
 */
export function isPreviewLogin(expiresAt: Date | string | null | undefined): boolean {
  return expiresAt != null;
}

/**
 * Has it lapsed?
 *
 * An unreadable date counts as expired. This gates a login, so the failure
 * direction has to be "refuse", never "allow" — a corrupt timestamp must not
 * become a permanent account.
 */
export function isExpired(
  expiresAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (expiresAt == null) return false; // a permanent account never expires
  const t = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt);
  if (Number.isNaN(t)) return true;
  return t <= now.getTime();
}

/**
 * Should this session be allowed through?
 *
 * The single question the login path asks. Permanent accounts always pass;
 * a preview login passes only while it is still live.
 */
export function previewLoginUsable(
  expiresAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  return !isExpired(expiresAt, now);
}

/**
 * "6 days left", "4 hours left", "Expired".
 *
 * Deliberately coarse. Whoever is running the demo needs to know roughly how
 * long they have, not to the minute.
 */
export function expiryLabel(
  expiresAt: Date | string | null | undefined,
  now: Date = new Date(),
): string {
  if (expiresAt == null) return "Never expires";
  if (isExpired(expiresAt, now)) return "Expired";

  const t = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt);
  const ms = t - now.getTime();
  const days = Math.floor(ms / DAY_MS);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} left`;

  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"} left`;

  const mins = Math.max(1, Math.floor(ms / 60_000));
  return `${mins} minute${mins === 1 ? "" : "s"} left`;
}
