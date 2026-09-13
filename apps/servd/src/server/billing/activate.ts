import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import { addMonths } from "@/lib/billing/period";

/**
 * Mark a subscription invoice paid and activate the subscription — the single
 * place a payment turns into access. Idempotent: matched by the invoice's
 * providerRef (gateway checkout/invoice id), advances the period one month.
 * Shared by the PayMongo and Xendit webhooks.
 */
export async function activateByProviderRef(
  providerRef: string,
  opts: { paymentMethodId?: string; customerId?: string } = {},
): Promise<boolean> {
  if (!providerRef) return false;
  return systemDb(async (tx) => {
    const invoice = await tx.restaurantInvoice.findFirst({ where: { providerRef } });
    if (!invoice) return false;

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
    return true;
  });
}
