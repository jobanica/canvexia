import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { getVoidPinStatus } from "@/server/orders/void-pin";
import { VoidPinForm } from "@/components/admin/VoidPinForm";

export default async function CashierSettingsPage() {
  const { restaurantId } = await requireAdminPage();
  const hasPin = await getVoidPinStatus(restaurantId);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">
          ← Dashboard
        </Link>
        <h1 className="font-heading text-2xl font-bold">Cashier settings</h1>
        <p className="text-sm text-plum-ink/50">
          Controls for the cashier POS. Open orders can only be closed once paid; voiding an unpaid
          order requires the PIN below.
        </p>
      </div>

      <VoidPinForm hasPin={hasPin} />
    </div>
  );
}
