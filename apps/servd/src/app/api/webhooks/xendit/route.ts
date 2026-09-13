import { NextRequest } from "next/server";
import { getPlatformBilling } from "@/server/billing/platform-settings";
import { XenditBillingProvider } from "@/server/billing/xendit";
import { activateByProviderRef } from "@/server/billing/activate";
import { markAddonPaidByProviderRef } from "@/server/billing/addons";
import { activateBranchByProviderRef } from "@/server/tenancy/branch-activation";
import { activateFeatureSubByProviderRef } from "@/server/billing/feature-subscriptions";
import {
  activatePreviewByProviderRef,
  abandonPreviewByProviderRef,
} from "@/server/build/activation";

/**
 * Xendit platform billing webhook — fires when a subscriber pays their
 * subscription invoice. Verifies Xendit's x-callback-token, then marks the
 * invoice paid and ACTIVATES the subscription (the system turns back on
 * automatically). Configure in the Xendit dashboard:
 *   Settings → Webhooks → Invoices paid → {APP_URL}/api/webhooks/xendit
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
    // An expired/failed DIY activation invoice: the preview survives as a warm
    // lead for manual follow-up, and the funnel numbers stay honest.
    await abandonPreviewByProviderRef(event.providerRef);
    return new Response("ok", { status: 200 });
  }

  // A paid BRANCH activation (₱499) — an owner switching on another shop.
  // Checked before the DIY handler because both read the same table: the DIY
  // one ends by creating a login and emailing credentials, which for a branch
  // would mean a second auth user on an email that already exists.
  if (await activateBranchByProviderRef(event.providerRef)) {
    return new Response("ok", { status: 200 });
  }

  // A paid DIY activation (₱499) — turn the preview into a real account. This
  // is the ONLY place activation can happen; the success page just reads it.
  if (await activatePreviewByProviderRef(event.providerRef)) {
    return new Response("ok", { status: 200 });
  }

  // A monthly per-feature subscription (e.g. the content scheduler) — activate
  // that feature only, never the main plan.
  if (await activateFeatureSubByProviderRef(event.providerRef)) {
    return new Response("ok", { status: 200 });
  }

  // One-time add-on (e.g. the custom-domain unlock) — grant it and stop, so it
  // never activates or extends a subscription.
  if (await markAddonPaidByProviderRef(event.providerRef)) {
    return new Response("ok", { status: 200 });
  }

  await activateByProviderRef(event.providerRef);
  return new Response("ok", { status: 200 });
}
