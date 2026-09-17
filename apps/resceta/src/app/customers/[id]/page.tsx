import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { getCustomer } from "@/server/pharmacy/customers";
import { loyaltySettings } from "@/server/pharmacy/loyalty";
import { can } from "@/lib/pharmacy/roles";
import { peso, manilaDate, manilaDateTime } from "@/lib/money";
import { CustomerForm } from "../CustomerForm";
import { PointsPanel } from "./PointsPanel";

export const dynamic = "force-dynamic";

/**
 * One customer: what they bought, what they are owed, and what was prescribed.
 *
 * The three lists are deliberately on one page. A pharmacist ringing a customer
 * about a repeat is holding all three questions at once — when were they last
 * in, what did the doctor write, and do they have points to spend.
 */
export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");

  const { id } = await params;
  const [customer, loyalty] = await Promise.all([
    getCustomer(staff.pharmacyId, id),
    loyaltySettings(staff.pharmacyId),
  ]);
  // Not found and not yours are the same answer: the query is scoped to the
  // session's pharmacy, so an id from another one simply returns nothing.
  if (!customer) notFound();

  const canAdjust = can(staff.role, "viewReports");
  const spent = customer.sales
    .filter((s) => s.status === "completed")
    .reduce((t, s) => t + s.totalCentavos, 0);

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link href="/customers" className="text-sm text-slate-500 underline">
          ← Customers
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{customer.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {customer.phone ? (
            <a href={`tel:${customer.phone}`} className="underline">
              {customer.phone}
            </a>
          ) : (
            "No mobile on file"
          )}
          {" · "}
          {peso(spent)} over {customer.sales.filter((s) => s.status === "completed").length}{" "}
          purchases
          {loyalty.on && ` · ${customer.pointsBalance} points`}
        </p>

        <div className="mt-8">
          <CustomerForm
            defaults={{
              id: customer.id,
              name: customer.name,
              phone: customer.phone,
              email: customer.email,
              address: customer.address,
              notes: customer.notes,
            }}
          />
        </div>

        {loyalty.on && canAdjust && (
          <div className="mt-6">
            <PointsPanel customerId={customer.id} balance={customer.pointsBalance} />
          </div>
        )}

        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Purchases
          </h2>
          {customer.sales.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              Nothing bought yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white text-sm">
              {customer.sales.map((s) => (
                <li key={s.id} className="flex items-center justify-between px-4 py-2">
                  <Link href={`/receipts/${s.id}`} className="font-mono text-xs underline">
                    {s.receiptNumber}
                  </Link>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{manilaDate(s.createdAt)}</span>
                    {s.status === "voided" && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">
                        voided
                      </span>
                    )}
                    {loyalty.on && s.pointsEarned > 0 && (
                      <span className="text-xs text-emerald-700">+{s.pointsEarned} pts</span>
                    )}
                    <span
                      className={`tabular-nums ${s.status === "voided" ? "text-slate-400 line-through" : ""}`}
                    >
                      {peso(s.totalCentavos)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {customer.prescriptions.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Prescriptions on file
            </h2>
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white text-sm">
              {customer.prescriptions.map((rx) => (
                <li key={rx.id} className="flex items-center justify-between px-4 py-2">
                  <span>
                    {rx.doctorName}
                    {rx.doctorPrcNo && (
                      <span className="ml-2 font-mono text-xs text-slate-400">
                        PRC {rx.doctorPrcNo}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-slate-500">{manilaDate(rx.dateIssued)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {loyalty.on && customer.loyaltyTxns.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Points ledger
            </h2>
            {/*
              THE LEDGER IS WHAT IS TRUE. The balance on the customer row is a
              cache so the counter does not sum a thousand rows while somebody
              waits; this is what gets shown to a customer who disputes it.
            */}
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white text-sm">
              {customer.loyaltyTxns.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-4 py-2">
                  <span>
                    <span className="uppercase text-xs text-slate-400">{t.kind}</span>
                    {t.note && <span className="ml-2 text-slate-600">{t.note}</span>}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{manilaDateTime(t.createdAt)}</span>
                    <span
                      className={`tabular-nums font-semibold ${t.points < 0 ? "text-red-700" : "text-emerald-700"}`}
                    >
                      {t.points > 0 ? "+" : ""}
                      {t.points}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </AppShell>
  );
}
