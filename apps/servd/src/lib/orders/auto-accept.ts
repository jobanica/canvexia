/**
 * Auto-accept — the shop takes an online order by itself when nobody answers.
 *
 * An online order arrives as `pending` and waits for a human to tap Accept. On
 * a busy counter nobody is watching the tablet, and the customer sits looking
 * at "waiting for the restaurant to confirm" while the food could have been
 * started. This closes that gap: after a wait the shop chooses, an unanswered
 * order accepts itself and goes to the kitchen exactly as a tapped one does.
 *
 * Off unless switched on. Nothing here changes what happens to a shop that
 * hasn't asked for it.
 *
 * Pure — the rules only, no I/O, so the boundaries can be stated once and
 * tested rather than re-derived at each call site.
 */

/** What the toggle turns on: the wait the request asked for. */
export const AUTO_ACCEPT_DEFAULT_SECONDS = 10;

/** The waits offered in the settings, in seconds. */
export const AUTO_ACCEPT_CHOICES = [10, 20, 30, 60, 120] as const;

/**
 * Floor and ceiling on a stored wait.
 *
 * The floor exists because a wait shorter than the screens' own refresh is a
 * lie — the merchant would never get a realistic chance to answer. The ceiling
 * is a sanity bound: past ten minutes, "auto-accept" isn't what anybody means.
 */
export const AUTO_ACCEPT_MIN_SECONDS = 5;
export const AUTO_ACCEPT_MAX_SECONDS = 600;

/**
 * Turn whatever is stored (or typed) into a usable wait, or null for off.
 *
 * Null, zero, a negative and anything unparseable all mean OFF rather than
 * some default wait. Auto-accept sends food to the kitchen without a person
 * agreeing to it, so a value nobody can make sense of must never be read as
 * permission.
 */
export function normalizeAutoAcceptSeconds(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(AUTO_ACCEPT_MAX_SECONDS, Math.max(AUTO_ACCEPT_MIN_SECONDS, Math.round(n)));
}

/** Is auto-accept switched on for this shop? */
export function autoAcceptEnabled(seconds: number | null | undefined): boolean {
  return normalizeAutoAcceptSeconds(seconds) != null;
}

/**
 * Orders placed at or before this moment have waited long enough.
 *
 * Returns null when auto-accept is off, so a caller that forgets to check gets
 * "there is no cutoff" rather than a cutoff of now — which would sweep up every
 * pending order in the shop.
 */
export function autoAcceptCutoff(seconds: number | null | undefined, now: Date = new Date()): Date | null {
  const wait = normalizeAutoAcceptSeconds(seconds);
  if (wait == null) return null;
  return new Date(now.getTime() - wait * 1000);
}

/** Has this particular order waited long enough to be accepted for the shop? */
export function isDueForAutoAccept(
  placedAt: Date | string,
  seconds: number | null | undefined,
  now: Date = new Date(),
): boolean {
  const cutoff = autoAcceptCutoff(seconds, now);
  if (!cutoff) return false;
  const ms = placedAt instanceof Date ? placedAt.getTime() : Date.parse(placedAt);
  if (Number.isNaN(ms)) return false;
  return ms <= cutoff.getTime();
}

/** How long this order still has before it accepts itself, in whole seconds. */
export function secondsUntilAutoAccept(
  placedAt: Date | string,
  seconds: number | null | undefined,
  now: Date = new Date(),
): number | null {
  const wait = normalizeAutoAcceptSeconds(seconds);
  if (wait == null) return null;
  const ms = placedAt instanceof Date ? placedAt.getTime() : Date.parse(placedAt);
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.ceil((ms + wait * 1000 - now.getTime()) / 1000));
}

/** "10 seconds", "1 minute", "2 minutes" — for the settings card and the queue. */
export function autoAcceptLabel(seconds: number | null | undefined): string {
  const wait = normalizeAutoAcceptSeconds(seconds);
  if (wait == null) return "off";
  if (wait < 60) return `${wait} seconds`;
  const mins = Math.round(wait / 60);
  return mins === 1 ? "1 minute" : `${mins} minutes`;
}
