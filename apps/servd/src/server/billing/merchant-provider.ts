import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import { getBillingProvider, getBillingProviderForPartner } from "@/server/billing";
import type { BillingProvider } from "@/server/billing/provider";

/**
 * The gateway that should take THIS merchant's money.
 *
 * The rule, and why it is not a silent fallback:
 *
 *   partner has a sub-account  → charge on it. The payment settles to the
 *                                partner, which is the whole of D5.
 *   partner has none           → charge on CANVEXIA's own account. Not a
 *                                fallback that loses money — there is no other
 *                                account for it to go to, and this is exactly
 *                                where it goes today.
 *
 * What would be dangerous is the reverse: a partner WITH a sub-account being
 * quietly charged on the platform account, which would route their revenue to
 * CANVEXIA while every statement said otherwise. That case is the one branch
 * here that can never fall through.
 *
 * Every merchant today belongs to the house partner (CANVEXIA Davao), which has
 * no sub-account, so in practice this resolves to the platform account and
 * behaves exactly as before. The sub-account path starts mattering the day the
 * first external operator is onboarded with the gateway — which is also the day
 * the mechanism in ./subaccount.ts needs to have been confirmed.
 */
export type MerchantProvider =
  | { ok: true; provider: BillingProvider }
  | { ok: false; message: string };

export async function getBillingProviderForMerchant(
  restaurantId: string,
): Promise<MerchantProvider> {
  let partnerId: string | null = null;
  try {
    const restaurant = await systemDb((tx) =>
      tx.restaurant.findUnique({ where: { id: restaurantId }, select: { partnerId: true } }),
    );
    partnerId = restaurant?.partnerId ?? null;
  } catch {
    partnerId = null; // partnerId not migrated yet — platform account, as before.
  }

  if (partnerId) {
    const forPartner = await getBillingProviderForPartner(partnerId);
    if (forPartner.ok) return { ok: true, provider: forPartner.provider };

    // "provider_has_no_subaccounts" is the one refusal that must NOT fall
    // through: the partner is set up to collect their own money and the
    // configured gateway cannot do it, so charging on the platform account would
    // silently take their revenue.
    if (forPartner.reason === "provider_has_no_subaccounts") {
      return {
        ok: false,
        message: "Billing isn't available for this account yet. Please contact your provider.",
      };
    }
    // not_configured / partner_not_onboarded → the partner has no separate
    // destination, so the platform account is the correct and only one.
  }

  const platform = await getBillingProvider();
  if (!platform) return { ok: false, message: "Billing isn't configured on the platform yet." };
  return { ok: true, provider: platform };
}
