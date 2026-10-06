import { UploadPostForm } from "@/components/super-admin/UploadPostForm";
import { getUploadPostKey } from "@/server/billing/platform-settings";

/**
 * Platform integrations.
 *
 * This page used to hold the Xendit credentials that collected subscription
 * payments. Gateway billing is retired (D38): restaurants pay by bank or QR
 * transfer and the receipt is confirmed in the agent portal
 * (agents.canvexia.com → Verification).
 */
export default async function SuperAdminPaymentsPage() {
  const uploadPostConfigured = !!(await getUploadPostKey());
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Payments &amp; integrations</h1>
        <p className="text-sm text-plum-ink/50">
          Subscription payments are no longer collected by card or e-wallet checkout. Owners pay by
          bank or QR transfer and upload the receipt; it is confirmed in the agent portal&apos;s
          verification queue, which activates or extends their account.
        </p>
      </div>
      <UploadPostForm configured={uploadPostConfigured} />
    </div>
  );
}
