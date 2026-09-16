/**
 * What happened at a visit.
 *
 * The VALUES are the contract — `attendance-actions.ts` validates against them
 * and `staff_visits.outcome` stores them — and the LABELS are what a person
 * reads. They were previously written out inside the field app, which meant the
 * manager's screen had no way to show anything but the raw value.
 */
export const VISIT_OUTCOMES = ["met_owner", "not_available", "follow_up", "signed"] as const;

export type VisitOutcome = (typeof VISIT_OUTCOMES)[number];

export const OUTCOME_LABELS: Record<string, string> = {
  met_owner: "Met the owner",
  not_available: "Not available",
  follow_up: "Follow-up set",
  signed: "Signed",
};

export function isVisitOutcome(value: string): value is VisitOutcome {
  return (VISIT_OUTCOMES as readonly string[]).includes(value);
}
