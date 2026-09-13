import { getBillingStatus } from "@/server/billing/platform-settings";
import { XenditForm } from "@/components/super-admin/XenditForm";
import { UploadPostForm } from "@/components/super-admin/UploadPostForm";
import { getUploadPostKey } from "@/server/billing/platform-settings";

export default async function SuperAdminPaymentsPage() {
  const status = await getBillingStatus();
  const uploadPostConfigured = !!(await getUploadPostKey());
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const webhookUrl = `${base.replace(/\/$/, "")}/api/webhooks/xendit`;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Payments</h1>
        <p className="text-sm text-plum-ink/50">
          Connect Xendit to collect subscription payments. When a subscriber pays their invoice,
          Xendit notifies us and their system is <strong>activated automatically</strong>.
        </p>
      </div>

      <XenditForm configured={status.xenditConfigured} webhookUrl={webhookUrl} />

      <UploadPostForm configured={uploadPostConfigured} />

      <div className="rounded-tile border border-plum-ink/10 bg-white p-5 text-sm text-plum-ink/65">
        <p className="font-semibold text-plum-ink">How it works</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Enter your Xendit secret key + webhook token above and save.</li>
          <li>In Xendit, point the <strong>Invoices paid</strong> webhook at the URL shown.</li>
          <li>
            On a subscriber&apos;s billing date, the billing run issues a Xendit invoice; the owner
            pays it from their Billing page.
          </li>
          <li>Xendit calls our webhook → the invoice is marked paid and the subscription is reactivated.</li>
        </ol>
      </div>
    </div>
  );
}
