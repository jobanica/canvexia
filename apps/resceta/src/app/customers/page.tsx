import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { listCustomers } from "@/server/pharmacy/customers";
import { loyaltySettings } from "@/server/pharmacy/loyalty";
import { CustomerBook } from "./CustomerBook";

export const dynamic = "force-dynamic";

/**
 * The customers this pharmacy knows.
 *
 * A pharmacy's customers are not a shop's: the same people come back every
 * month for the same maintenance medicine, and knowing who they are is how a
 * repeat prescription gets chased before they run out. That is the reason this
 * exists, ahead of the loyalty points it also carries.
 */
export default async function CustomersPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");

  const [rows, loyalty] = await Promise.all([
    listCustomers(staff.pharmacyId),
    loyaltySettings(staff.pharmacyId),
  ]);

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">
          {loyalty.on
            ? `Earning ${loyalty.pointsPerPeso} point${loyalty.pointsPerPeso === 1 ? "" : "s"} per peso. A point is worth ${loyalty.centavosPerPoint} centavo${loyalty.centavosPerPoint === 1 ? "" : "s"}.`
            : "Loyalty points are switched off. Turn them on in Settings to start issuing them."}
        </p>
        <CustomerBook rows={rows} loyaltyOn={loyalty.on} />
      </main>
    </AppShell>
  );
}
