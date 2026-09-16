import "server-only";
import { withOptOut, type SmsProvider } from "@servd/core";
import { systemDb } from "@/server/tenancy/scoped-db";
import { getSmsProvider } from "@/server/sms";

/**
 * Sending, on the partner axis.
 *
 * A8.1 ONLY BUILDS WHAT CONSENT NEEDS: the opt-out confirmation, and the two
 * rules every later send has to obey. Campaigns are A8.3; putting a send loop
 * here now would mean a second one to reconcile then.
 *
 * THE SENDER NAME. A partner's own name is used only once HQ has marked it
 * approved — registration with the aggregator is manual and a name that is not
 * registered is rejected by the network, not by us. Until then everything goes
 * out under CANVEXIA's default, which is registered.
 */
const DEFAULT_SENDER = "CANVEXIA";

export interface PartnerSender {
  senderName: string;
  optOutText: string | null;
  /** True when the partner's own name is in use rather than the fallback. */
  own: boolean;
}

export async function partnerSender(partnerId: string): Promise<PartnerSender> {
  try {
    const row = await systemDb((tx) =>
      tx.partner.findUnique({
        where: { id: partnerId },
        select: { smsSenderName: true, smsSenderStatus: true, smsOptOutText: true },
      }),
    );
    const approved = row?.smsSenderStatus === "approved" && !!row.smsSenderName;
    return {
      senderName: approved ? (row!.smsSenderName as string) : DEFAULT_SENDER,
      optOutText: row?.smsOptOutText ?? null,
      own: approved,
    };
  } catch {
    return { senderName: DEFAULT_SENDER, optOutText: null, own: false };
  }
}

/**
 * Send one marketing message, with the opt-out line appended.
 *
 * THE APPEND IS NOT OPTIONAL and this is the only partner-side marketing
 * sender, so there is one place it could be forgotten and it is not forgotten
 * here. A partner may reword the line; `withOptOut` falls back to the default
 * when the override is empty.
 */
export async function sendMarketing(
  partnerId: string,
  to: string,
  body: string,
  provider: SmsProvider | null = getSmsProvider(),
): Promise<{ ok: boolean; providerRef?: string; error?: string }> {
  if (!provider) return { ok: false, error: "SMS is not configured on the platform." };
  const sender = await partnerSender(partnerId);
  return provider.send(sender.senderName, to, withOptOut(body, sender.optOutText));
}

/**
 * The single confirmation after somebody opts out.
 *
 * NO OPT-OUT LINE ON THIS ONE — `withOptOut` is not called, deliberately.
 * Telling somebody who just opted out how to opt out is noise, and this message
 * is transactional: it is the receipt for a request they made.
 *
 * Best effort. The opt-out is already recorded; a failed receipt must never
 * make the webhook look like it failed, because the provider would then retry
 * and the person would get the text twice.
 */
export async function sendOptOutConfirmation(partnerId: string, to: string): Promise<void> {
  try {
    const provider = getSmsProvider();
    if (!provider) return;
    const sender = await partnerSender(partnerId);
    await provider.send(
      sender.senderName,
      to,
      "You're unsubscribed and won't get marketing texts from us again.",
    );
  } catch {
    /* the opt-out stands either way */
  }
}
