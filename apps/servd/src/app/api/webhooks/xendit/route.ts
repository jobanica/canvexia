import { NextRequest } from "next/server";
import { getPlatformBilling } from "@/server/billing/platform-settings";
import { XenditBillingProvider } from "@/server/billing/xendit";
import { settleFailedEvent, settlePaidEvent } from "@/server/billing/settle";
import { PLATFORM_SCOPE } from "@/server/billing/settlement-scope";

/**
 * Xendit webhook for CANVEXIA's OWN account.
 *
 * Verifies the platform's `x-callback-token`, then settles whatever the payment
 * was for. Configure in the Xendit dashboard:
 *   Settings → Webhooks → Invoices paid → {APP_URL}/api/webhooks/xendit
 *
 * PLATFORM_SCOPE is correct here and nowhere near a partner: this route
 * authenticates against the platform's own callback token, so an event reaching
 * it came from the single trusted account the original design assumed. A
 * partner's merchants pay into that partner's sub-account and their events
 * arrive at /api/webhooks/billing/[partnerId], which scopes to that partner.
 */
export async function POST(req: NextRequest) {
  const billing = await getPlatformBilling();
  if (!billing.xendit?.secretKey) return new Response("Not configured", { status: 404 });

  const rawBody = await req.text();
  const token = req.headers.get("x-callback-token") ?? "";
  const provider = new XenditBillingProvider(billing.xendit.secretKey, billing.xendit.callbackToken);
  const event = provider.verifyAndParseWebhook(rawBody, token);
  if (!event) return new Response("Invalid token", { status: 401 });

  if (event.status !== "paid") {
    await settleFailedEvent(event, PLATFORM_SCOPE);
    return new Response("ok", { status: 200 });
  }

  await settlePaidEvent(event, PLATFORM_SCOPE);
  return new Response("ok", { status: 200 });
}
