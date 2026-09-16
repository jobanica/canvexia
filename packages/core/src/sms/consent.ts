/**
 * Marketing-consent wording, as pure functions.
 *
 * THE STRING IS STORED WITH THE CONSENT. What somebody agreed to is the exact
 * sentence they were shown, not "the current version of our opt-in copy" — so
 * these functions produce it and the caller writes it down. Editing the copy
 * later must never rewrite what a person already agreed to.
 *
 * Each states WHO sends, WHAT about, roughly HOW OFTEN, and HOW TO STOP, which
 * is the minimum the PH Data Privacy Act's consent standard asks for.
 *
 * `brandName`, not `restaurantName`: a partner operator sends under their own
 * brand as of A8, and the sentence is the same shape either way. Transactional
 * messages — receipts, order updates — are NOT covered by this and must not
 * reuse it.
 */
export function marketingConsentText(brandName: string): string {
  return `Want deals from ${brandName}? Get occasional promo texts (a few a month). Reply STOP anytime.`;
}

/** The double-opt-in confirmation message body. */
export function confirmationSmsBody(brandName: string): string {
  return `Reply YES to confirm you'd like offers from ${brandName}. Reply STOP to cancel. Msg rates may apply.`;
}

/**
 * Consent, as the four things that have to be written down.
 *
 * `unknown` IS NOT A SOFT YES. Only `opted_in` may be sent a marketing message;
 * `unknown` means nobody has asked yet, and `opted_out` is final until a new
 * consent event happens in the real world.
 */
export type ConsentStatus = "opted_in" | "opted_out" | "unknown";

/** Where a consent came from. Each has its own evidence sentence below. */
export type ConsentSource =
  | "visit"
  | "lead_form"
  | "merchant_owner"
  | "import_attested"
  | "manual"
  | "reply";

export const CONSENT_LABEL: Record<ConsentStatus, string> = {
  opted_in: "Opted in",
  opted_out: "Opted out",
  unknown: "Not asked",
};

/**
 * Why a contact cannot be sent to. Shown beside the greyed-out row.
 *
 * The brief asks for the REASON, not just the greying: "opted out" and "nobody
 * has asked them" are different problems with different fixes — one is final,
 * the other is a conversation.
 */
export function whyNotSendable(status: ConsentStatus): string | null {
  if (status === "opted_in") return null;
  return status === "opted_out"
    ? "They opted out. Only a new consent event can change that."
    : "Nobody has asked them yet.";
}

export function canReceiveMarketing(status: string): boolean {
  return status === "opted_in";
}

/**
 * The evidence sentence, per capture point.
 *
 * WRITTEN AT CAPTURE TIME AND STORED. This is what somebody would be shown if
 * they complain, so it names who, when and how — and it is a sentence rather
 * than a code, because the person reading it back will not be an engineer.
 */
export function consentEvidence(input: {
  source: ConsentSource;
  staffName?: string;
  at: Date;
  detail?: string;
}): string {
  const when = input.at.toISOString().slice(0, 10);
  const who = input.staffName ? ` by ${input.staffName}` : "";
  switch (input.source) {
    case "visit":
      return `Verbal consent at a visit on ${when}, logged${who}.`;
    case "lead_form":
      return `Ticked the consent box on the enquiry form on ${when}.${
        input.detail ? ` Wording shown: "${input.detail}"` : ""
      }`;
    case "merchant_owner":
      return `Agreed during merchant onboarding on ${when}${who}.`;
    case "import_attested":
      return `Imported on ${when}${who}. Attested: "${input.detail ?? "prior consent held"}"`;
    case "reply":
      return `Replied to confirm on ${when}.`;
    default:
      return `Recorded on ${when}${who}.`;
  }
}

/** The default opt-out line. A partner may reword it; it cannot be removed. */
export const DEFAULT_OPT_OUT_TEXT = "Reply STOP to opt out.";

/**
 * Append the opt-out line to a marketing message.
 *
 * NOT REMOVABLE, which is why this is a function rather than a template
 * variable: a caller can change the WORDING (`partners.smsOptOutText`) and
 * cannot leave it off. An empty or whitespace override falls back to the
 * default rather than producing a message with no way out of it.
 *
 * If the body already ends with the line — a composer that shows a preview will
 * — it is not added twice.
 */
export function withOptOut(body: string, wording?: string | null): string {
  const line = (wording ?? "").trim() || DEFAULT_OPT_OUT_TEXT;
  const text = body.trim();
  if (text.toLowerCase().endsWith(line.toLowerCase())) return text;
  return `${text}\n${line}`;
}
