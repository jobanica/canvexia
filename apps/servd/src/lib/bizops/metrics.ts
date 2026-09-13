/**
 * The arithmetic behind the business dashboard.
 *
 * Pure, and separated from the queries for one reason: every number on that
 * screen is something the founder will act on — move ad budget, chase a lead,
 * decide a channel is working. A wrong figure here is worse than a missing one,
 * because a blank prompts a question and a wrong number ends it.
 *
 * So the rule throughout: when the inputs cannot answer the question, return
 * null and let the screen print an em dash. Never 0, never 100%, never a
 * silently-defaulted denominator.
 */

/** A figure the screen prints as "—" when it can't be computed. */
export type Maybe = number | null;

/**
 * A ÷ B as a percentage, or null when there's no denominator.
 *
 * Zero leads is not "0% conversion" — it is no answer. Returning 0 there puts a
 * red number on a dashboard for a week nobody advertised in.
 */
export function rate(part: number, whole: number): Maybe {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return (part / whole) * 100;
}

/** Cost per lead, or null when nothing was spent or nothing came in. */
export function perUnit(total: number, units: number): Maybe {
  if (!Number.isFinite(total) || !Number.isFinite(units) || units <= 0) return null;
  return total / units;
}

/** Whole days between two moments, floored, never negative. */
export function daysBetween(from: Date | string, to: Date | string = new Date()): number {
  const a = from instanceof Date ? from.getTime() : Date.parse(from);
  const b = to instanceof Date ? to.getTime() : Date.parse(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

/** "—" for null, otherwise a whole percent. */
export function fmtRate(v: Maybe): string {
  return v == null ? "—" : `${Math.round(v)}%`;
}

/** Centavos → "₱1,234". "—" when there is nothing to show. */
export function fmtPeso(centavos: Maybe): string {
  if (centavos == null) return "—";
  return `₱${Math.round(centavos / 100).toLocaleString("en-PH")}`;
}

/** A count, or "—" when the source of it doesn't exist yet. */
export function fmtCount(v: Maybe): string {
  return v == null ? "—" : v.toLocaleString("en-PH");
}

/**
 * Where a restaurant sits against its monthly order cap.
 *
 * The thresholds are the ones in the brief: 70 opportunity, 80 notify, 90
 * prompt, 100 capped. An unlimited plan has no percentage at all — dividing by
 * Infinity would print 0% and read as "barely using it", which is the opposite
 * of the truth for the shops that outgrew a cap long ago.
 */
export type CapBand = "unlimited" | "ok" | "opportunity" | "notify" | "prompt" | "capped";

export function capBand(ordersThisMonth: number, cap: number | null): CapBand {
  if (cap == null || !Number.isFinite(cap)) return "unlimited";
  if (cap <= 0) return "unlimited";
  const pct = (ordersThisMonth / cap) * 100;
  if (pct >= 100) return "capped";
  if (pct >= 90) return "prompt";
  if (pct >= 80) return "notify";
  if (pct >= 70) return "opportunity";
  return "ok";
}

export function capPercent(ordersThisMonth: number, cap: number | null): Maybe {
  if (cap == null || !Number.isFinite(cap) || cap <= 0) return null;
  return (ordersThisMonth / cap) * 100;
}

/** Bands that mean somebody should do something about it. */
export function isUpsellBand(band: CapBand): boolean {
  return band === "opportunity" || band === "notify" || band === "prompt" || band === "capped";
}
