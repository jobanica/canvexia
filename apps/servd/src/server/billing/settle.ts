import "server-only";
import { activateByProviderRef } from "@/server/billing/activate";
import { markAddonPaidByProviderRef } from "@/server/billing/addons";
import { activateBranchByProviderRef } from "@/server/tenancy/branch-activation";
import { activateFeatureSubByProviderRef } from "@/server/billing/feature-subscriptions";
import {
  activatePreviewByProviderRef,
  abandonPreviewByProviderRef,
} from "@/server/build/activation";
import type { BillingWebhookEvent } from "@/server/billing/provider";
import type { SettlementScope } from "@/server/billing/settlement-scope";
import { creditSmsTopUpByProviderRef } from "@/server/partners/sms-topup";

/**
 * Turn one verified gateway event into whatever it was paying for.
 *
 * Extracted so the Xendit platform webhook and the per-partner webhook run the
 * SAME ordered chain. Two copies of a first-match-wins sequence is two places
 * for the order to drift, and the order is load-bearing — see the branch/DIY
 * comment below.
 *
 * Every handler takes the scope and refuses anything outside it, so which
 * gateway the event arrived from is checked once per candidate rather than
 * assumed by the route.
 */

/** A payment that did not succeed. */
export async function settleFailedEvent(
  event: BillingWebhookEvent,
  scope: SettlementScope,
): Promise<void> {
  // An expired or failed DIY activation invoice: the preview survives as a warm
  // lead for manual follow-up, and the funnel numbers stay honest.
  await abandonPreviewByProviderRef(event.providerRef, scope);
}

/** A payment that succeeded. First handler to claim it wins. */
export async function settlePaidEvent(
  event: BillingWebhookEvent,
  scope: SettlementScope,
): Promise<void> {
  // A paid BRANCH activation — an owner switching on another shop. Checked
  // before the DIY handler because both read the same table: the DIY one ends by
  // creating a login and emailing credentials, which for a branch would mean a
  // second auth user on an email that already exists.
  if (await activateBranchByProviderRef(event.providerRef, scope)) return;

  // A paid DIY activation — turn the preview into a real account. This is the
  // ONLY place activation can happen; the success page just reads it.
  if (await activatePreviewByProviderRef(event.providerRef, scope)) return;

  // A monthly per-feature subscription — activate that feature only, never the
  // main plan.
  if (await activateFeatureSubByProviderRef(event.providerRef, scope)) return;

  // One-time add-on — grant it and stop, so it never activates or extends a
  // subscription.
  if (await markAddonPaidByProviderRef(event.providerRef, scope)) return;

  // A partner buying SMS credits from CANVEXIA. Refuses any scope but the
  // platform's, because this is the one payment in the system that flows
  // TOWARDS us rather than towards an operator.
  if (await creditSmsTopUpByProviderRef(event.providerRef, scope)) return;

  await activateByProviderRef(event.providerRef, scope, {
    paymentMethodId: event.paymentMethodId,
    customerId: event.customerId,
  });
}
