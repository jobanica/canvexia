import { NextRequest } from "next/server";
import { getPlatformBilling } from "@/server/billing/platform-settings";
import { XenditBillingProvider } from "@/server/billing/xendit";
import { settleFailedEvent, settlePaidEvent } from "@/server/billing/settle";
import { partnerScope } from "@/server/billing/settlement-scope";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * Gateway webhook for ONE partner's merchants.
 *
 * Under D5 (Option B) a merchant pays into their partner's sub-account beneath
 * CANVEXIA's platform credential. The partner in the URL is what the settlement
 * is scoped to: nothing reached from here can touch another partner's merchant,
 * whatever reference the payload carries.
 *
 * WHAT THE SCOPING ACTUALLY BUYS, honestly stated. Under Option B a partner
 * never holds a callback token — CANVEXIA holds the only credential — so this is
 * not primarily defence against a malicious partner. It defends against the
 * likelier thing: a gateway reference that is unique within a sub-account but
 * not across them, or a webhook URL configured against the wrong partner. Both
 * settle the wrong merchant's invoice, and neither announces itself. Under
 * Option A, where partners would hold their own tokens, the same code is the
 * defence against malice too — which is why it is built the same way regardless
 * of how docs/canvexia/xendit-questions.md §1 is answered.
 *
 * VERIFICATION uses the platform's callback token, because under Option B that
 * is the only token there is. If Xendit turns out to issue one per sub-account
 * (xendit-questions.md §3.1), the token lookup below moves to the partner row
 * and nothing else here changes.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ partnerId: string }> },
) {
  const { partnerId } = await params;
  if (!partnerId) return new Response("Not found", { status: 404 });

  const billing = await getPlatformBilling();
  if (!billing.xendit?.secretKey) return new Response("Not configured", { status: 404 });

  // The partner must exist and be onboarded with the gateway. A webhook naming a
  // partner who has no sub-account is either a stale configuration or somebody
  // guessing at URLs; neither should reach a settlement handler.
  const partner = await systemDb((tx) =>
    tx.partner.findUnique({
      where: { id: partnerId },
      select: { id: true, status: true, gatewaySubAccountId: true },
    }),
  ).catch(() => null);

  if (!partner || !partner.gatewaySubAccountId) {
    return new Response("Unknown partner", { status: 404 });
  }

  const rawBody = await req.text();
  const token = req.headers.get("x-callback-token") ?? "";
  const provider = new XenditBillingProvider(billing.xendit.secretKey, billing.xendit.callbackToken);
  const event = provider.verifyAndParseWebhook(rawBody, token);
  if (!event) return new Response("Invalid token", { status: 401 });

  const scope = partnerScope(partner.id);

  if (event.status !== "paid") {
    await settleFailedEvent(event, scope);
    return new Response("ok", { status: 200 });
  }

  // A suspended partner's merchants keep their access when they pay. Suspension
  // is between CANVEXIA and the operator; a diner-facing shop going dark because
  // of a dispute upstream would punish the wrong party, and the payment has
  // already been taken either way.
  await settlePaidEvent(event, scope);
  return new Response("ok", { status: 200 });
}
