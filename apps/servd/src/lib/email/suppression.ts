/**
 * Who is allowed to receive a scheduled follow-up, decided at SEND time.
 *
 * This is the most consequential logic in the acquisition sequence, so it lives
 * here — pure, with no database or provider anywhere near it — rather than
 * inline in the runner. Emailing "activate your restaurant!" to someone who
 * paid yesterday is the single worst thing that system can do, and a rule that
 * important should be one a test can hold to account.
 *
 * The whole point is that it runs against who this person is TODAY, not who
 * they were when the step was scheduled a week ago. A step is a plan; this is
 * the decision.
 */

export type SendDecision =
  | { send: true }
  /** Cancel permanently — the reason is recorded on the row. */
  | { send: false; skip: string }
  /** Leave it scheduled and try again next pass. */
  | { send: false; defer: true };

export interface ScheduledSend {
  track: string;
  stepKey: string;
}

/** The subset of the lead that decides this. Deliberately small. */
export interface LeadState {
  status: string;
  contactEmail: string | null;
  emailOptOut: boolean;
  previewReachedAt: Date | null;
}

export interface SendContext {
  /** The step's copy, or undefined if there is none. */
  template?: { enabled: boolean } | null;
  /** The lead row, or null if it has since been deleted. */
  lead: LeadState | null;
  /** Whether an email provider is configured at all. */
  configured: boolean;
}

/**
 * The §5 suppression list, in order. The ordering matters: `activated` is
 * checked before everything except the step being switched off, so a paying
 * customer is recorded as having been suppressed for the right reason rather
 * than incidentally caught by a later rule.
 */
export function decideSend(send: ScheduledSend, ctx: SendContext): SendDecision {
  // Paused from super-admin. Checked first so a disabled step costs nothing to
  // evaluate and reads as "disabled" rather than as something about the lead.
  if (!ctx.template || !ctx.template.enabled) return { send: false, skip: "disabled" };

  const lead = ctx.lead;
  if (!lead) return { send: false, skip: "lead_gone" };

  // THE rule. Anything that isn't still a preview has paid (or been archived),
  // and the relationship has moved in-app permanently.
  if (lead.status !== "preview") return { send: false, skip: "activated" };

  if (lead.emailOptOut) return { send: false, skip: "unsubscribed" };

  // A Track A step for someone who has since reached a preview: they've already
  // done the thing A was asking for, and Track B is carrying them now. Sending
  // it anyway would be both useless and slightly insulting.
  if (send.track === "A" && lead.previewReachedAt) return { send: false, skip: "moved_to_B" };

  if (!lead.contactEmail?.trim()) return { send: false, skip: "no_email" };

  // No provider configured yet. DEFER rather than skip: burning the step here
  // would silently consume someone's whole sequence during the window before
  // the founder pastes in an API key.
  if (!ctx.configured) return { send: false, defer: true };

  return { send: true };
}
