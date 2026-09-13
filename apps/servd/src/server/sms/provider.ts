/**
 * SMS PROVIDER ABSTRACTION
 *
 * The PLATFORM holds one provider account (e.g. Semaphore); usage is metered per
 * restaurant via the credit ledger. Business logic talks to this interface so we
 * can swap Semaphore ↔ PhilSMS ↔ Twilio without touching the campaign/opt-in
 * flow.
 */

export interface SendResult {
  ok: boolean;
  providerRef?: string;
  error?: string;
}

export interface InboundMessage {
  from: string; // sender's phone
  text: string; // message body
}

export interface SmsProvider {
  /** Send one message from a registered sender name. */
  send(senderName: string, to: string, body: string): Promise<SendResult>;

  /** Parse a provider-specific inbound webhook payload into {from, text}. */
  parseInbound(payload: unknown): InboundMessage | null;
}
