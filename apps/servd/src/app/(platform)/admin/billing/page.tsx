import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { ManualBilling } from "@/components/billing/ManualBilling";

/**
 * Billing. Every restaurant pays by QR or bank transfer and uploads the
 * receipt; the agent portal confirms it and calls back (D37). The card and
 * e-wallet checkout through the payment gateway, the one-time feature store
 * and gateway invoices are retired (D38).
 */
export default async function BillingPage() {
  // allowSuspended so an owner can pay their way out of suspension here.
  const { restaurantId } = await requireAdminPage({ allowSuspended: true });
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">← Dashboard</Link>
        <h1 className="font-heading text-2xl font-bold">Billing</h1>
        <p className="text-sm text-plum-ink/50">
          Pay by QR or bank transfer, then upload your receipt. We confirm it and your account stays active.
        </p>
      </div>
      <ManualBilling restaurantId={restaurantId} />
    </div>
  );
}
