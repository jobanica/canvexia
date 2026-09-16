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
