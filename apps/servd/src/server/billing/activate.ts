import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import { addMonths } from "@/lib/billing/period";
import { restaurantInScope, type SettlementScope } from "@/server/billing/settlement-scope";
import { recordSettlement } from "@/server/billing/ledger";

/**
 * Mark a subscription invoice paid and activate the subscription — the single
 * place a payment turns into access. Idempotent: matched by the invoice's
 * providerRef (gateway checkout/invoice id), advances the period one month.
 * Shared by the PayMongo and Xendit webhooks.
 */
export async function activateByProviderRef(
  providerRef: string,
  scope: SettlementScope,
  opts: { paymentMethodId?: string; customerId?: string } = {},
): Promise<boolean> {
  if (!providerRef) return false;
  return systemDb(async (tx) => {
    const invoice = await tx.restaurantInvoice.findFirst({ where: { providerRef } });
    if (!invoice) return false;
    // Before anything is written: is this settlement allowed to touch this
    // merchant at all? Returning false rather than throwing keeps the webhook's
    // "not mine, try the next handler" flow intact.
    if (!(await restaurantInScope(tx, invoice.restaurantId, scope))) return false;

    const now = new Date();
    await tx.restaurantInvoice.update({
      where: { id: invoice.id },
      data: { status: "paid", paidAt: now },
    });

    const sub = await tx.subscription.findFirst({
      where: { restaurantId: invoice.restaurantId },
      orderBy: { createdAt: "desc" },
    });
    if (sub) {
      const base = sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: "active",
          currentPeriodEnd: addMonths(base, 1),
          failedCharges: 0,
          ...(opts.paymentMethodId ? { providerPaymentMethodId: opts.paymentMethodId } : {}),
          ...(opts.customerId ? { providerCustomerId: opts.customerId } : {}),
        },
      });
    }
    // Paying clears any suspension → the subscriber's system is reactivated.
    await tx.restaurant.update({ where: { id: invoice.restaurantId }, data: { status: "active" }, select: { id: true } });

    // D15: the payment is recorded against the owning partner, in the same
    // transaction that granted the access it paid for. The amount is the
    // invoice's, not the plan's — what was actually settled, which is the whole
    // distinction the ledger exists to keep.
    await recordSettlement(tx, {
      restaurantId: invoice.restaurantId,
      providerRef,
      kind: "subscription",
      grossAmount: invoice.amount,
      occurredAt: now,
    });

    return true;
  });
}
