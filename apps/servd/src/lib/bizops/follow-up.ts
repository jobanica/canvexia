import { daysBetween } from "./metrics";

/**
 * Who is due a follow-up, and what to say.
 *
 * Two intake tracks feed one list. An outreach prospect from the CRM is chased
 * on its own sequence; a DIY signup that built a preview and never paid is
 * chased too, and until now nothing chased it at all — those are the warmest
 * leads in the business and they were sitting in a funnel report nobody worked
 * from.
 *
 * The suppression rule is the important part of this file. It is the same
 * discipline as the email suppression list: a lead that has PAID or ACTIVATED
 * must never appear on a chase list, whatever its stage field says. Stage is
 * something a human updates and forgets; paid is a fact. Chasing a customer for
 * money they already sent is the one mistake here that costs trust rather than
 * time.
 */

export type FollowUpTrack = "outreach" | "diy_preview";

export interface FollowUpCandidate {
  id: string;
  name: string;
  track: FollowUpTrack;
  /** The moment the clock runs from — preview sent, or last touch. */
  since: string | null;
  /** When the next chase is due. Null = due now (nothing scheduled yet). */
  dueAt: string | null;
  /** How many chases have already gone out. */
  step: number;
  paidAt: string | null;
  activatedAt: string | null;
  stage: string | null;
}

export interface DueFollowUp extends FollowUpCandidate {
  daysSince: number;
  overdue: boolean;
}

/**
 * Has this lead moved past the point of being chased?
 *
 * Checked at RENDER time rather than trusted from a stored flag, because the
 * payment may have landed since the row was last touched — which is exactly
 * the case where a chase message is most embarrassing.
 */
export function isSettled(c: FollowUpCandidate): boolean {
  if (c.paidAt || c.activatedAt) return true;
  const stage = (c.stage ?? "").toLowerCase();
  return stage === "won" || stage === "paid" || stage === "activated" || stage === "lost";
}

/**
 * The chase list: due or overdue, longest-waiting first.
 *
 * Longest-waiting first and not soonest-due, deliberately. A list sorted by due
 * date puts today's easy wins on top and buries the lead that has been ignored
 * for three weeks — and that one is either the biggest save available or the
 * clearest signal to mark it lost. Either way it needs the attention more.
 */
export function dueFollowUps(
  candidates: readonly FollowUpCandidate[],
  now: Date = new Date(),
): DueFollowUp[] {
  const nowMs = now.getTime();
  return candidates
    .filter((c) => !isSettled(c))
    .map((c) => {
      const dueMs = c.dueAt ? Date.parse(c.dueAt) : nowMs;
      return {
        ...c,
        daysSince: c.since ? daysBetween(c.since, now) : 0,
        overdue: Number.isNaN(dueMs) ? true : dueMs < nowMs,
      };
    })
    // Nothing scheduled for next week; this is a "what do I do today" list.
    .filter((c) => c.overdue || !c.dueAt)
    .sort((a, b) => b.daysSince - a.daysSince);
}

/**
 * A message to copy into Messenger. This layer never sends anything — it
 * surfaces and suggests, and the founder or VA sends it themselves.
 *
 * Written in the Taglish a Philippine shop owner actually gets messaged in, and
 * escalating: the first is a nudge, the last gives them an easy way out. A
 * fourth chase that reads like the first is what gets an account blocked.
 */
export function suggestedMessage(c: DueFollowUp, businessName?: string): string {
  const name = businessName || c.name || "boss";
  if (c.track === "diy_preview") {
    if (c.step <= 0) {
      return `Hi ${name}! Nakita ko po na natapos ninyo na ang preview ng online ordering page ninyo sa Servd. Gusto ko lang pong itanong kung may natanong kayo bago i-activate? ₱499 one-time lang po, walang monthly.`;
    }
    if (c.step === 1) {
      return `Hi ${name}, follow up ko lang po sa page ninyo sa Servd. Nakahanda na po iyon — kailangan na lang pong i-activate para makatanggap na kayo ng orders. May maitutulong po ba ako para makapagsimula kayo?`;
    }
    return `Hi ${name}, huling follow up ko na po. Nakatabi pa rin po ang preview ninyo kung gusto ninyong ituloy. Kung hindi po ngayon ang tamang panahon, sabihin ninyo lang po at hindi ko na kayo istorbohin — bukas pa rin po kami kung kailan ninyo kailangan.`;
  }
  if (c.step <= 0) {
    return `Hi ${name}! Ako po si [pangalan] ng Servd. Nakita ko po ang page ninyo — tumutulong po kami sa mga restaurant na makapag-online ordering nang walang commission sa bawat benta. Pwede ko po bang ipakita sa inyo kung ano ang itsura nito para sa inyo?`;
  }
  if (c.step === 1) {
    return `Hi ${name}, balik lang po ako sa message ko. Pwede po akong gumawa ng libreng preview ng ordering page ninyo para makita ninyo muna bago kayo magdesisyon — walang bayad at walang obligasyon.`;
  }
  return `Hi ${name}, huli ko na pong follow up para hindi ko na kayo maistorbo. Kung interesado po kayo balang araw, nandito lang po ako. Salamat po!`;
}
