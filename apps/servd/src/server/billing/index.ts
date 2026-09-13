import "server-only";
import { PayMongoBillingProvider } from "./paymongo";
import { XenditBillingProvider } from "./xendit";
import { getPlatformBilling } from "./platform-settings";
import { bindSubAccount } from "./subaccount";
import { systemDb } from "@/server/tenancy/scoped-db";
import type { BillingProvider } from "./provider";

/**
 * The platform's OWN billing provider — CANVEXIA charging on its own account.
 *
 * Preference order:
 *   1. Xendit, if configured in the super-admin → Payments page (DB).
 *   2. PayMongo, if PAYMONGO_* env vars are set.
 *   3. null (billing not configured).
 *
 * This is no longer the right function for charging a partner's merchant — see
 * getBillingProviderForPartner below. It remains correct for anything CANVEXIA
 * bills on its own behalf, and for the platform webhook route.
 */
export async function getBillingProvider(): Promise<BillingProvider | null> {
  const billing = await getPlatformBilling();
  if (billing.provider === "xendit" && billing.xendit?.secretKey) {
    return new XenditBillingProvider(billing.xendit.secretKey, billing.xendit.callbackToken);
  }

  const key = process.env.PAYMONGO_SECRET_KEY;
  const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (key && webhookSecret) return new PayMongoBillingProvider(key, webhookSecret);

  return null;
}

export type PartnerProviderResult =
  | { ok: true; provider: BillingProvider }
  | { ok: false; reason: "not_configured" | "partner_not_onboarded" | "provider_has_no_subaccounts" };

/**
 * A provider that acts for ONE partner's merchants.
 *
 * Under D5 (Option B) a merchant's payment settles into their partner's
 * sub-account, not CANVEXIA's. So the platform credential is used, and the call
 * names the partner's sub-account.
 *
 * Returns a REASON rather than null on failure, because the three ways this can
 * fail need three different answers from the caller and squashing them into null
 * is what turns "this partner has not finished onboarding" into a blank screen:
 *
 *   not_configured             — CANVEXIA has no gateway set up at all.
 *   partner_not_onboarded      — the partner has no sub-account yet.
 *   provider_has_no_subaccounts — the configured gateway cannot act for one.
 *
 * The last one is deliberately an error and not a quiet fallback to the
 * platform's own account. Falling back would route a merchant's money into
 * CANVEXIA's balance while every statement said it went to the partner — a
 * silent misdirection of somebody else's revenue, which is far worse than a
 * checkout that refuses to open.
 */
export async function getBillingProviderForPartner(
  partnerId: string,
): Promise<PartnerProviderResult> {
  const billing = await getPlatformBilling();

  if (!(billing.provider === "xendit" && billing.xendit?.secretKey)) {
    // PayMongo is a platform-account integration here; it has no sub-account
    // concept, so it cannot collect on a partner's behalf.
    const configured = !!process.env.PAYMONGO_SECRET_KEY;
    return { ok: false, reason: configured ? "provider_has_no_subaccounts" : "not_configured" };
  }

  let subAccountId: string | null = null;
  try {
    const partner = await systemDb((tx) =>
      tx.partner.findUnique({
        where: { id: partnerId },
        select: { gatewaySubAccountId: true },
      }),
    );
    subAccountId = partner?.gatewaySubAccountId ?? null;
  } catch {
    // Column not migrated yet — the same answer as a partner who has not been
    // onboarded, which is the truthful one either way: no sub-account, no
    // charging.
    return { ok: false, reason: "partner_not_onboarded" };
  }

  if (!subAccountId) return { ok: false, reason: "partner_not_onboarded" };

  return {
    ok: true,
    provider: new XenditBillingProvider(
      billing.xendit.secretKey,
      billing.xendit.callbackToken,
      bindSubAccount(subAccountId),
    ),
  };
}
