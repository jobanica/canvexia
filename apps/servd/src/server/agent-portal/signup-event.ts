import "server-only";
import type { Prisma } from "@prisma/client";
import { newEventId, normalizeReferralCode } from "@servd/core/agent-kit";
import { enqueueProductEvent } from "@servd/db";
import { productSlug } from "./config";

/**
 * Queue customer.signed_up for a new restaurant, in the caller's transaction.
 *
 * Every path that creates a paying restaurant goes through here — self-signup,
 * DIY activation, and HQ creating an account in super-admin — so the portal
 * knows every customer whose receipts it will be asked to confirm. A receipt
 * for a customer the portal never heard of waits forever.
 *
 * The portal requires an owner name and phone. Paths that never ask for them
 * send a readable placeholder rather than an empty string, which the portal
 * would refuse outright; an admin can see it and fix the record.
 */
export async function queueSignupEvent(
  tx: Prisma.TransactionClient,
  r: { restaurantId: string; businessName: string; ownerName?: string | null; ownerPhone?: string | null; agentCode?: string | null },
): Promise<void> {
  await enqueueProductEvent(tx, productSlug(), {
    event_id: newEventId(),
    type: "customer.signed_up",
    occurred_at: new Date().toISOString(),
    data: {
      external_customer_id: r.restaurantId,
      business_name: r.businessName,
      owner_name: r.ownerName?.trim() || `Owner of ${r.businessName}`,
      owner_phone: r.ownerPhone?.trim() || "not given",
      agent_code: normalizeReferralCode(r.agentCode) ?? null,
      plan: null,
    },
  });
}
