/**
 * The scorecard's arithmetic. PURE — facts in, rows out.
 *
 * Separate from the reads because the interesting part is the judgement, not
 * the query: what counts as a conversion, what a conversion RATE is a rate of,
 * and what to show when the denominator is zero. All three are arguable and
 * none of them need a database to be argued about.
 */

export interface StaffFacts {
  partnerUserId: string;
  name: string;
  /** From `staff_events`, for the month. */
  visits: number;
  demos: number;
  trials: number;
  conversions: number;
  /** Counted now, not at month end — see `activeMerchants` below. */
  activeMerchants: number;
  churnedMerchants: number;
  target: { merchants: number; visits: number; demos: number } | null;
}

export interface ScorecardRow extends StaffFacts {
  /**
   * Conversions ÷ demos, 0–1, or null when there were no demos.
   *
   * NULL, NOT ZERO. A salesperson who ran no demos this month has no
   * conversion rate; showing 0% says they tried and failed, which is a
   * different and worse claim about somebody's work.
   *
   * The denominator is DEMOS rather than visits on purpose: a visit where the
   * owner was out is not a chance that was missed, and counting it would make
   * the rate a measure of how often people are in.
   */
  conversionRate: number | null;
  /** 0–1 per target, capped at 1. Null when no target was set. */
  progress: { merchants: number; visits: number; demos: number } | null;
  /** True when a target exists and every line is met. */
  onTarget: boolean;
}

export function buildScorecard(facts: readonly StaffFacts[]): ScorecardRow[] {
  return facts.map((f) => {
    const conversionRate = f.demos > 0 ? f.conversions / f.demos : null;
    const progress = f.target
      ? {
          merchants: ratio(f.conversions, f.target.merchants),
          visits: ratio(f.visits, f.target.visits),
          demos: ratio(f.demos, f.target.demos),
        }
      : null;
    return {
      ...f,
      conversionRate,
      progress,
      onTarget: progress ? progress.merchants >= 1 && progress.visits >= 1 && progress.demos >= 1 : false,
    };
  });
}

/**
 * Progress against one target line.
 *
 * A target of ZERO reads as complete rather than dividing by zero. That is not
 * a dodge: "no visits expected this month" is a target that is met by doing
 * nothing, and the alternative is a row that shows 0% forever for a line
 * nobody was asked to hit.
 */
function ratio(actual: number, target: number): number {
  if (target <= 0) return 1;
  return Math.min(1, actual / target);
}

/**
 * The leaderboard order: conversions, then demos, then visits.
 *
 * Deliberately NOT conversion rate. One demo and one conversion is 100%, and a
 * leaderboard that puts that above somebody who ran forty demos and closed
 * twelve is a leaderboard that rewards not trying. Rate is shown in its own
 * column, where it is information rather than a ranking.
 */
export function leaderboard(rows: readonly ScorecardRow[]): ScorecardRow[] {
  return [...rows].sort(
    (a, b) =>
      b.conversions - a.conversions ||
      b.demos - a.demos ||
      b.visits - a.visits ||
      a.name.localeCompare(b.name),
  );
}

/** "2026-09" → "2026-08". Arithmetic on the key, which has no time zone in it. */
export function previousMonthKey(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1
    ? `${y - 1}-12`
    : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** The last N month keys, newest first, including this one. */
export function recentMonths(current: string, n = 6): string[] {
  const out = [current];
  for (let i = 1; i < n; i++) out.push(previousMonthKey(out[out.length - 1]));
  return out;
}
