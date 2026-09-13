"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import { getBillingProvider } from "@/server/billing";
import { startPlan, cancelAtPeriodEnd, PLAN_FIELDS } from "@/server/billing/subscription";
import { addMonths } from "@/lib/billing/period";

/**
 * Starts a hosted checkout to pay the current/overdue invoice. This is also how
 * the card gets saved for off-session renewals (captured via the webhook). The
 * subscription is only activated by the signature-verified webhook, never here.
 */
export async function payNow(): Promise<{ ok?: boolean; checkoutUrl?: string; error?: string }> {
  const { restaurantId } = await requireAdminAction();
  const provider = await getBillingProvider();
  if (!provider) return { error: "Billing isn't configured on the platform yet." };

  const info = await tenantDb(restaurantId, async (tx) => {
    const sub = await tx.subscription.findFirst({
      orderBy: { createdAt: "desc" },
      include: { plan: { select: PLAN_FIELDS } },
    });
    if (!sub) throw new Error("No subscription");
    let invoice = await tx.restaurantInvoice.findFirst({
      where: { status: "open" },
      orderBy: { createdAt: "desc" },
    });
    if (!invoice) {
      invoice = await tx.restaurantInvoice.create({
        data: {
          restaurantId,
          amount: sub.plan.priceMonthly,
          status: "open",
          periodStart: new Date(),
          periodEnd: addMonths(new Date(), 1),
        },
      });
    }
    return { invoiceId: invoice.id, amount: invoice.amount, planName: sub.plan.name };
  });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  let checkout;
  try {
    checkout = await provider.createInvoiceCheckout({
      amount: info.amount,
      description: `Servd ${info.planName} subscription`,
      referenceNumber: info.invoiceId.slice(0, 12),
      successUrl: `${base}/admin/billing?paid=1`,
    });
  } catch {
    return { error: "Couldn't start checkout. Please try again." };
  }

  await tenantDb(restaurantId, (tx) =>
    tx.restaurantInvoice.update({
      where: { id: info.invoiceId },
      data: { providerRef: checkout.gatewayRef },
    }),
  );
  return { ok: true, checkoutUrl: checkout.checkoutUrl };
}

export async function selectPlan(formData: FormData): Promise<void> {
  const { restaurantId } = await requireAdminAction();
  const planId = String(formData.get("planId") ?? "").trim();
  if (!planId) {
    // No plan row mapped to this tier yet (e.g. plan names not synced).
    redirect("/admin/billing?plan=unavailable");
  }

  let ok = false;
  try {
    await startPlan(restaurantId, planId);
    ok = true;
  } catch (e) {
    // Never surface a raw server-action crash to the owner — show a friendly
    // banner instead so the billing page stays usable.
    console.error("selectPlan failed", e);
  }

  revalidatePath("/admin/billing");
  redirect(ok ? "/admin/billing?plan=changed" : "/admin/billing?plan=error");
}

export async function cancelSubscription(): Promise<void> {
  const { restaurantId } = await requireAdminAction();
  await cancelAtPeriodEnd(restaurantId);
  revalidatePath("/admin/billing");
}
