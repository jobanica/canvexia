/**
 * The events a partner can be notified about.
 *
 * A closed list here rather than free text in the column, so a preferences
 * screen and a sender cannot disagree about what an event is called — the
 * failure mode being a toggle that silently controls nothing.
 */
export const NOTIFICATION_EVENTS = [
  "trial.started",
  "payment.failed",
  "trial.ending",
  "milestone.at_risk",
  "statement.ready",
  "lead.received",
  "ticket.replied",
  "hq.announcement",
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const NOTIFICATION_LABELS: Record<NotificationEvent, string> = {
  "trial.started": "A merchant starts a trial",
  "payment.failed": "A merchant's payment fails",
  "trial.ending": "A trial ends within 7 days",
  "milestone.at_risk": "A milestone falls behind pace",
  "statement.ready": "A monthly statement is ready",
  "lead.received": "Someone submits your lead form",
  "ticket.replied": "A merchant replies to a ticket",
  "hq.announcement": "CANVEXIA posts an announcement",
};

export function isNotificationEvent(value: string): value is NotificationEvent {
  return (NOTIFICATION_EVENTS as readonly string[]).includes(value);
}
