import "server-only";
import { PayMongoBillingProvider } from "./paymongo";
import { XenditBillingProvider } from "./xendit";
import { getPlatformBilling } from "./platform-settings";
import type { BillingProvider } from "./provider";

/**
 * The platform's billing provider (charges restaurants for their subscription).
 *
 * Preference order:
 *   1. Xendit, if configured in the super-admin → Payments page (DB).
 *   2. PayMongo, if PAYMONGO_* env vars are set.
 *   3. null (billing not configured).
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
