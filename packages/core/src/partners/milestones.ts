/**
 * The milestone ladder, and whether a partner is keeping to it.
 *
 * Pure. No database, no clock of its own — `asOf` is always passed in, because a
 * function that reads `new Date()` internally cannot be tested at a date that
 * matters.
 *
 * WHY A LADDER AND NOT TWO COLUMNS. The brief asked for `milestone_6mo_target`
 * and `milestone_12mo_target`; the operating answer was three checkpoints — 10
 * merchants by month 1, 25 by month 3, 50 by month 6. Those are different
 * models, and HQ wanting a fourth checkpoint for one city should not be a
 * migration. So `partners.milestones` is `[{ month, target }]` and this module
 * owns its shape.
 */
export interface Milestone {
  /** Months after the licence started. 1 = "by the end of month 1". */
  month: number;
  /** Active paying merchants required by then. */
  target: number;
}

/** Used when a partner has no ladder of their own. */
export const DEFAULT_MILESTONES: readonly Milestone[] = [
  { month: 1, target: 10 },
  { month: 3, target: 25 },
  { month: 6, target: 50 },
];

/**
 * Read a ladder off a JSON column.
 *
 * NULL means "use the default", NOT "no milestones". A partner with an empty
 * ladder would silently always read as on track, which is the one answer this
 * feature must never give by accident.
 */
export function parseMilestones(value: unknown): Milestone[] {
  if (!Array.isArray(value)) return [...DEFAULT_MILESTONES];
  const rows = value
    .filter(
      (m): m is Milestone =>
        !!m &&
        typeof m === "object" &&
        Number.isFinite((m as Milestone).month) &&
        Number.isFinite((m as Milestone).target),
    )
    .map((m) => ({
      month: Math.max(1, Math.round(m.month)),
      target: Math.max(0, Math.round(m.target)),
    }))
    .sort((a, b) => a.month - b.month);
  return rows.length > 0 ? rows : [...DEFAULT_MILESTONES];
}

export type MilestoneStatus = "on_track" | "at_risk" | "missed" | "met";

export interface MilestoneProgress extends Milestone {
  /** Merchants counted now. */
  actual: number;
  /** 0–1, clamped. `target` 0 reads as complete rather than dividing by zero. */
  progress: number;
  /** Null when the licence start date is unknown. */
  dueAt: Date | null;
  daysRemaining: number | null;
  status: MilestoneStatus;
}

/** Months are added on the calendar, so "1 Feb + 1 month" is 1 March. */
function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Where a partner stands against one checkpoint.
 *
 * "At risk" is behind LINEAR pace, per the brief: a partner three weeks into a
 * one-month, ten-merchant target needs 7.5 and has 4. Linear is a crude model of
 * how sales actually lands, and the copy that renders this should say so rather
 * than presenting it as a forecast.
 *
 * Without a licence start date there is no pace to be behind, so the status is
 * `on_track` and `dueAt` is null — the portal shows "start date not set" instead
 * of inventing one. Reading it as missed would tell a brand-new partner they had
 * already failed.
 */
export function milestoneProgress(
  milestone: Milestone,
  actual: number,
  licenseStartedAt: Date | null,
  asOf: Date,
): MilestoneProgress {
  const progress = milestone.target <= 0 ? 1 : Math.min(1, actual / milestone.target);
  const met = actual >= milestone.target;

  if (!licenseStartedAt) {
    return {
      ...milestone,
      actual,
      progress,
      dueAt: null,
      daysRemaining: null,
      status: met ? "met" : "on_track",
    };
  }

  const dueAt = addMonths(licenseStartedAt, milestone.month);
  const daysRemaining = Math.ceil((dueAt.getTime() - asOf.getTime()) / DAY);

  if (met) return { ...milestone, actual, progress, dueAt, daysRemaining, status: "met" };
  if (daysRemaining <= 0) {
    return { ...milestone, actual, progress, dueAt, daysRemaining, status: "missed" };
  }

  const windowMs = dueAt.getTime() - licenseStartedAt.getTime();
  const elapsedMs = Math.max(0, asOf.getTime() - licenseStartedAt.getTime());
  const expected = windowMs <= 0 ? milestone.target : (elapsedMs / windowMs) * milestone.target;

  return {
    ...milestone,
    actual,
    progress,
    dueAt,
    daysRemaining,
    status: actual < expected ? "at_risk" : "on_track",
  };
}

/** The whole ladder, plus the checkpoint the portal should lead with. */
export function ladderProgress(
  milestones: readonly Milestone[],
  actual: number,
  licenseStartedAt: Date | null,
  asOf: Date,
): { steps: MilestoneProgress[]; current: MilestoneProgress | null } {
  const steps = milestones.map((m) => milestoneProgress(m, actual, licenseStartedAt, asOf));
  // The next one not yet met; if they are all met, the last one, so the portal
  // has something to show rather than an empty card.
  const current = steps.find((s) => s.status !== "met") ?? steps[steps.length - 1] ?? null;
  return { steps, current };
}
