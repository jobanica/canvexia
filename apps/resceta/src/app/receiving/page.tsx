import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { receivingOptions, recentDeliveries } from "@/server/pharmacy/receiving";
import { can } from "@/lib/pharmacy/roles";
import { peso, manilaDate } from "@/lib/money";
import { ReceivingForm } from "./ReceivingForm";

export const dynamic = "force-dynamic";

export default async function ReceivingPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login?next=%2Freceiving");

  // Gated here as well as hidden from the nav. The nav is a convenience; this
  // is the check.
  if (!can(staff.role, "manageStock")) {
    return (
      <AppShell staff={staff}>
        <main className="mx-auto max-w-lg px-6 py-16 text-center">
          <p className="rounded-lg border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6 text-sm text-slate-300">
            This account cannot receive stock.
          </p>
        </main>
      </AppShell>
    );
  }

  const [{ products, suppliers }, deliveries] = await Promise.all([
    receivingOptions(staff.pharmacyId),
    recentDeliveries(staff.pharmacyId),
  ]);
  const canCreateProducts = can(staff.role, "manageCatalogue");

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Receive stock</h1>
        <p className="mb-8 text-sm text-slate-300">
          Every line becomes its own batch, with its own lot number, expiry and
          cost — two deliveries of the same drug are two batches, because they
          expire on different days and cost different money.
        </p>

        {!canCreateProducts && (
          <p className="mb-6 rounded-xl border border-white/10 bg-white/[0.06] p-3 text-sm text-slate-300">
            You can receive stock into products that already exist. Adding a new
            product needs a manager or the owner — the selling price is what the
            till will charge.
          </p>
        )}

        <ReceivingForm
          products={products}
          suppliers={suppliers}
          canCreateProducts={canCreateProducts}
        />

        <section className="mt-12">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Recent deliveries
          </h2>
          {deliveries.length === 0 ? (
            <p className="rounded-lg border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 text-sm text-slate-300">
              Nothing received yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {deliveries.map((d) => (
                <li key={d.ref} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] backdrop-blur-xl">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/[0.06] px-4 py-2 text-sm">
                    <span className="text-slate-200">{d.reason ?? "Delivery received"}</span>
                    <span className="text-xs text-slate-500">{manilaDate(d.at)}</span>
                  </div>
                  <ul className="divide-y divide-white/10 text-sm">
                    {d.lines.map((l, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
                        <span className="font-medium">{l.product}</span>
                        <span className="font-mono text-xs text-slate-500">
                          {l.lotNumber ?? "no lot"}
                        </span>
                        <span className="text-slate-500">
                          exp {l.expiryDate ? manilaDate(l.expiryDate) : "—"}
                        </span>
                        <span className="ml-auto tabular-nums">+{l.quantity}</span>
                        {can(staff.role, "viewReports") && (
                          <span className="tabular-nums text-slate-500">
                            @ {peso(l.costCentavos)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </AppShell>
  );
}
