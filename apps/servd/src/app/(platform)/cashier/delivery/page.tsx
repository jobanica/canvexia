import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { getDeliveryOrders } from "@/server/orders/delivery";
import { DeliveryBoard } from "@/components/cashier/DeliveryBoard";
import { StaffDataError } from "@/components/StaffDataError";

export default async function CashierDeliveryPage() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || !["cashier", "admin"].includes(user.role)) {
    redirect("/login");
  }

  let initial;
  try {
    initial = await getDeliveryOrders();
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) throw e;
    return <StaffDataError title="Delivery orders" message={e instanceof Error ? e.message : String(e)} />;
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">Delivery orders</h1>
        <Link href="/cashier" className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold">← Cashier</Link>
      </div>
      <p className="mb-6 text-sm text-plum-ink/60">
        Every active delivery order with the customer&apos;s pinned location. Copy the coordinates into your delivery app.
      </p>
      <DeliveryBoard restaurantId={user.restaurantId} initial={initial} />
    </div>
  );
}
