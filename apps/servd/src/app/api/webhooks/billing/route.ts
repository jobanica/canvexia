import { NextRequest } from "next/server";
import { getBillingProvider } from "@/server/billing";
import { activateByProviderRef } from "@/server/billing/activate";
import { markAddonPaidByProviderRef } from "@/server/billing/addons";
import { activateFeatureSubByProviderRef } from "@/server/billing/feature-subscriptions";
import { activatePreviewByProviderRef } from "@/server/build/activation";
import { systemDb } from "@/server/tenancy/scoped-db";
import { PLATFORM_SCOPE } from "@/server/billing/settlement-scope";

/**
 * PayMongo webhook for CANVEXIA's OWN account.
 *
 * STAYS LIVE. An earlier plan had this returning 410 once the per-partner route
 * existed, which was wrong: this URL is configured in the PayMongo dashboard and
 * is how subscriptions settle today. Retiring it before every partner is on a
 * sub-account AND the dashboards are reconfigured would stop live payments from
 * settling, with the only symptom being customers who paid and did not get
 * access.
 *
 * PLATFORM_SCOPE is right here — the route authenticates against the platform's
 * own signature, so events reaching it came from the single trusted account.
 * Partner merchants settle at /api/webhooks/billing/[partnerId].
 *
 * Original note: Marks an invoice paid + activates the
 * subscription after signature verification. (Xendit uses /api/webhooks/xendit.)
 *
 * Configure in PayMongo (platform account): {APP_URL}/api/webhooks/billing
 */
export async function POST(req: NextRequest) {
  const provider = await getBillingProvider();
  if (!provider) return new Response("Not configured", { status: 404 });

  const rawBody = await req.text();
  const signature = req.headers.get("paymongo-signature") ?? "";
  const event = provider.verifyAndParseWebhook(rawBody, signature);
  if (!event) return new Response("Invalid signature", { status: 400 });

  // A refund used to claw back referral rewards; there are none to reverse now.
  if (event.status === "refunded") return new Response("ok", { status: 200 });

  if (event.status !== "paid") return new Response("ok", { status: 200 });

  // A paid DIY activation (₱499) — turn that preview into a real account.
  if (await activatePreviewByProviderRef(event.providerRef, PLATFORM_SCOPE)) {
    return new Response("ok", { status: 200 });
  }

  // A monthly per-feature subscription (e.g. the content scheduler) — activate
  // that feature only, never the main plan.
  if (await activateFeatureSubByProviderRef(event.providerRef, PLATFORM_SCOPE)) {
    return new Response("ok", { status: 200 });
  }

  // One-time add-on (e.g. the custom-domain unlock) — grant it and stop, so it
  // never activates or extends a subscription.
  if (await markAddonPaidByProviderRef(event.providerRef, PLATFORM_SCOPE)) {
    return new Response("ok", { status: 200 });
  }

  await activateByProviderRef(event.providerRef, PLATFORM_SCOPE, {
    paymentMethodId: event.paymentMethodId,
    customerId: event.customerId,
  });
  return new Response("ok", { status: 200 });
}
