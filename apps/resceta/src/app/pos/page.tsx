import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { catalogue } from "@/server/pharmacy/queries";
import { can } from "@/lib/pharmacy/roles";
import { Counter } from "./Counter";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login?next=%2Fpos");

  // Gated here as well as hidden from the nav. The nav is a convenience; this
  // is the check.
  if (!can(staff.role, "sell")) {
    return (
      <AppShell staff={staff}>
        <main className="mx-auto max-w-lg px-6 py-16 text-center">
          <p className="rounded-lg border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6 text-sm text-slate-300">
            This account cannot ring up sales.
          </p>
        </main>
      </AppShell>
    );
  }

  const products = await catalogue(staff.pharmacyId);

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-8 text-2xl font-semibold tracking-tight">Counter</h1>
        {staff.pharmacyStatus !== "active" ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            This pharmacy cannot dispense yet.
          </p>
        ) : (
          <Counter
            vatRatePct={staff.vatRatePct}
            products={products}
            canDispenseRx={can(staff.role, "dispenseRx")}
          />
        )}
      </main>
    </AppShell>
  );
}
