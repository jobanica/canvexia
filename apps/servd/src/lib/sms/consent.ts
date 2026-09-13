/**
 * The exact marketing-consent wording shown to the diner. It states WHO sends,
 * WHAT about, the FREQUENCY, and HOW to stop — and we store this string as proof
 * of consent. Keep transactional (receipts/order updates) separate: this text is
 * ONLY for marketing opt-in.
 */
export function marketingConsentText(restaurantName: string): string {
  return `Want deals from ${restaurantName}? Get occasional promo texts (a few a month). Reply STOP anytime.`;
}

/** The double-opt-in confirmation message body. */
export function confirmationSmsBody(restaurantName: string): string {
  return `Reply YES to confirm you'd like offers from ${restaurantName}. Reply STOP to cancel. Msg rates may apply.`;
}
