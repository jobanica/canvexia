/**
 * The SMS provider interface.
 *
 * IN packages/core BECAUSE IT IS TYPES, and because two axes now speak it: a
 * restaurant sending to its diners and a partner operator sending to its own
 * contacts. The PLATFORM holds one provider account (Semaphore, in the
 * Philippines) and usage is metered per sender through a credit ledger; the
 * implementation lives in the app, where `fetch` and the API key belong.
 *
 * Business logic talks to this interface so Semaphore can be swapped for
 * PhilSMS or Twilio without touching a campaign or an opt-in flow.
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
