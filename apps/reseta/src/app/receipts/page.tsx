import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { recentSales } from "@/server/pharmacy/queries";
import { can } from "@/lib/pharmacy/roles";
import { peso, manilaDate } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function ReceiptsPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login?next=%2Freceipts");
  if (!can(staff.role, "sell")) {
    return (
      <AppShell staff={staff}>
        <main className="mx-auto max-w-lg px-6 py-16 text-center">
          <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
            This account can&apos;t see receipts.
          </p>
        </main>
      </AppShell>
    );
  }

  const sales = await recentSales(staff.pharmacyId, 60);

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Receipts</h1>
        <p className="mb-8 text-sm text-slate-600">
          Open one to void it or take a return against it. A void is same-day
          only — after that a return is the right document.
        </p>

        {sales.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
            No sales yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
            {sales.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/receipts/${s.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-slate-50"
                >
                  <span className="font-mono text-xs text-slate-500">{s.receiptNumber}</span>
                  <span className="text-slate-500">{manilaDate(s.createdAt)}</span>
                  {s.status === "voided" && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">
                      voided
                    </span>
                  )}
                  {s.discountType !== "none" && (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs uppercase text-emerald-800">
                      {s.discountType}
                    </span>
                  )}
                  <span
                    className={`ml-auto tabular-nums ${s.status === "voided" ? "text-slate-400 line-through" : ""}`}
                  >
                    {peso(s.totalCentavos)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AppShell>
  );
}
