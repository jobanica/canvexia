import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { getCashierTables, getIncomingOrders, type IncomingOrder } from "@/server/orders/cashier";
import { hasFeature } from "@/server/billing/feature-gate";
import { CashierBoard } from "@/components/cashier/CashierBoard";
import { ServiceWorkerRegister } from "@/components/offline/ServiceWorkerRegister";
import { StaffDataError } from "@/components/StaffDataError";
import { hasTutorials } from "@/server/tutorials/tutorials";
import { staffLabel } from "@/server/tenancy/staff-name";
import { cardSurchargeBp } from "@/server/orders/surcharge";
import { kitchenNeedsBluetoothPairing, tillNeedsBluetoothPairing } from "@/server/printing/kitchen-printer";
import { paysBeforeCooking } from "@/server/printing/kitchen-options";

export default async function CashierHome() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || !["cashier", "admin"].includes(user.role)) {
    redirect("/login");
  }

  let initialTables;
  let initialIncoming: IncomingOrder[] = [];
  let offlineEnabled = false;
  try {
    const r = await tenantDb(user.restaurantId, (tx) =>
      tx.restaurant.findFirstOrThrow({ select: { status: true } }),
    );
    if (r.status === "suspended") return redirect("/suspended");
    [initialTables, initialIncoming, offlineEnabled] = await Promise.all([
      getCashierTables(),
      getIncomingOrders(),
      hasFeature(user.restaurantId, "offline"),
    ]);
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) {
      throw e;
    }
    return (
      <StaffDataError
        title="Cashier"
        message={e instanceof Error ? e.message : String(e)}
      />
    );
  }

  const cashierName = await staffLabel(user.restaurantId, user.staffUserId);
  // Shown in the pay modal so the cashier can read the total out before the
  // customer taps. The settle recomputes it server-side regardless.
  const surchargeBp = await cardSurchargeBp(user.restaurantId);
  // Whether this shop takes the money before the food is made.
  const payFirst = await paysBeforeCooking(user.restaurantId);
  const kitchenBluetooth = await kitchenNeedsBluetoothPairing(user.restaurantId);
  // Only a shop whose receipt printer IS Bluetooth gets told when the device
  // can't pair one — otherwise it's a warning about a capability they never use.
  const tillBluetooth = await tillNeedsBluetoothPairing(user.restaurantId);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {user.role === "admin" && (
        <Link href="/admin" className="mb-1 inline-flex items-center gap-1 text-sm font-semibold text-plum-ink/55 hover:text-plum-ink/80">
          ← Dashboard
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-heading text-2xl font-bold">Cashier</h1>
        {/* Whose account this is. Sales are recorded against it, so the person
            at the till needs to see at a glance that it's theirs — and not the
            shift they took over from. */}
        <span className="inline-flex items-center gap-2 rounded-full border border-plum-ink/10 bg-white px-3 py-1.5 text-sm">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-gradient text-xs font-bold text-white">
            {cashierName.charAt(0).toUpperCase()}
          </span>
          <span className="font-semibold">{cashierName}</span>
          <span className="text-xs text-plum-ink/45">{user.role}</span>
        </span>
      </div>
      <p className="mb-6 text-sm text-plum-ink/60">
        Open tables, payments, bill requests, and ticket printing.
      </p>

      <CashierBoard
        restaurantId={user.restaurantId}
        initialTables={initialTables}
        initialIncoming={initialIncoming}
        isAdmin={user.role === "admin"}
        offlineEnabled={offlineEnabled}
        showTutorials={await hasTutorials()}
        cardSurchargeBp={surchargeBp}
        payFirst={payFirst}
        kitchenBluetooth={kitchenBluetooth}
        tillBluetooth={tillBluetooth}
      />
      {offlineEnabled && <ServiceWorkerRegister />}
    </div>
  );
}
