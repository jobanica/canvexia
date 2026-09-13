import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { getDeliverySettings } from "@/server/delivery/settings";
import { DeliverySettingsForm } from "@/components/admin/DeliverySettingsForm";

export default async function DeliverySettingsPage() {
  const { restaurantId } = await requireAdminPage();
  const settings = await getDeliverySettings(restaurantId);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.servdph.com";
  const webhookUrl = `${appUrl}/api/webhooks/delivery/${restaurantId}`;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">← Dashboard</Link>
        <h1 className="font-heading text-2xl font-bold">Delivery partners</h1>
        <p className="text-sm text-plum-ink/55">
          Choose how staff book a rider for delivery orders. Manual works right away; add a
          deep-link or API provider when you&apos;ve picked one. The booking button shows on every
          delivery order in the cashier &amp; merchant screens.
        </p>
      </div>
      <DeliverySettingsForm initial={settings} webhookUrl={webhookUrl} />
    </div>
  );
}
