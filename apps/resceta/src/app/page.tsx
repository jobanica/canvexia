import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { Kpi } from "@/components/Kpi";
import { RevenueChart } from "@/components/RevenueChart";
import { RangeFilter } from "@/components/RangeFilter";
import { catalogue, expiryReport, recentSales } from "@/server/pharmacy/queries";
import { salesReport, inventoryValuation } from "@/server/pharmacy/reports";
import { parseRange } from "@/lib/pharmacy/range";
import { can } from "@/lib/pharmacy/roles";
import { peso, manilaDate } from "@/lib/money";
import { InstallApp } from "@/components/InstallApp";

export const dynamic = "force-dynamic";

/**
 * The dashboard, for whichever pharmacy the session resolves to.
 *
 * Note what is NOT here: a pharmacy id, a slug, any parameter at all beyond the
 * date window. The pharmacy comes from `getCurrentStaff()`, which reads the
 * session and the membership rows.
 *
 * WHAT CHANGED AND WHY — this screen used to be three tables: expiring stock,
 * the whole catalogue, and a list of receipts. Every one of those is a screen
 * of its own now (Alerts, Catalogue, Receipts), and printing them here meant
 * the first thing an owner saw was a wall of rows with no total anywhere in it.
 * "Did we make money this month" was not answerable from the app that held
 * every sale.
 *
 * So: the figures first, then the two questions a pharmacist opens the app to
 * ask — what expires next and what is running out — as counts that link to the
 * full lists rather than reprinting them.
 *
 * A CASHIER SEES NONE OF THE MONEY. `viewReports` gates the whole top half,
 * because the person at the till on a Saturday has no business knowing the
 * shop's margin, and the role exists to make that true.
 */
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");

  const showMoney = can(staff.role, "viewReports");
  const range = parseRange(await searchParams);

  const [stock, expiring, report, valuation, sales] = await Promise.all([
    catalogue(staff.pharmacyId),
    expiryReport(staff.pharmacyId, 90),
    showMoney ? salesReport(staff.pharmacyId, range) : null,
    showMoney ? inventoryValuation(staff.pharmacyId) : null,
    showMoney ? recentSales(staff.pharmacyId, 6) : Promise.resolve([]),
  ]);

  const lowStock = stock.filter((p) => p.onHand <= p.reorderPoint);
  const outOfStock = stock.filter((p) => p.onHand === 0);
  const expired = expiring.filter((b) => b.expired);

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{staff.pharmacyName}</h1>
            {showMoney && (
              <p className="mt-1 text-sm text-slate-500">
                Profit is the selling price less what that batch cost to buy.
              </p>
            )}
          </div>
          {showMoney && <RangeFilter range={range} />}
        </div>

        {report && valuation && (
          <>
            <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Kpi
                label="Revenue"
                value={peso(report.revenueCentavos)}
                note={`${range.from} to ${range.to}`}
                tone="emerald"
              />
              <Kpi
                label="Gross profit"
                value={peso(report.profitCentavos)}
                note={`${report.marginPct.toFixed(1)}% margin`}
                tone={report.profitCentavos < 0 ? "red" : "emerald"}
              />
              <Kpi
                label="Transactions"
                value={report.transactions.toLocaleString("en-PH")}
                note={`${report.itemsSold.toLocaleString("en-PH")} items sold`}
              />
              <Kpi
                label="Stock at cost"
                value={peso(valuation.atCostCentavos)}
                note={`${valuation.units.toLocaleString("en-PH")} units on hand`}
                tone="amber"
              />
              <Kpi
                label="Profit on the shelf"
                value={peso(valuation.potentialProfitCentavos)}
                note="if every unit sold at today's price"
                tone="amber"
              />
              <Kpi
                label="Expired stock"
                value={peso(valuation.expiredValueCentavos)}
                note={
                  valuation.expiredUnits > 0
                    ? `${valuation.expiredUnits} units to write off`
                    : "nothing expired"
                }
                tone={valuation.expiredUnits > 0 ? "red" : "slate"}
              />
            </section>

            {report.revenueCentavos > 0 ? (
              <section className="mb-8 rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Takings per day
                </h2>
                <RevenueChart series={report.series} />
                {report.discountCentavos > 0 && (
                  <p className="mt-3 text-xs text-slate-500">
                    {peso(report.discountCentavos)} given as discount, of which{" "}
                    {peso(report.vatExemptCentavos)} was VAT-exempt (senior citizen and PWD).
                  </p>
                )}
              </section>
            ) : (
              <p className="mb-8 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                No sales in this window. Change the dates, or ring one up at the{" "}
                <Link href="/pos" className="font-medium underline">
                  counter
                </Link>
                .
              </p>
            )}
          </>
        )}

        {/*
          THE TWO QUESTIONS, as counts rather than tables. Both link to the
          screen that answers them properly; a dashboard that reprints the
          whole expiry report is a dashboard nobody scrolls past.
        */}
        <section className="mb-8 grid gap-3 sm:grid-cols-3">
          <Alert
            href="/alerts"
            label="Already expired"
            count={expired.length}
            tone={expired.length > 0 ? "red" : "slate"}
            note={expired.length > 0 ? "cannot be dispensed" : "nothing past its date"}
          />
          <Alert
            href="/alerts"
            label="Expiring in 90 days"
            count={expiring.length - expired.length}
            tone={expiring.length - expired.length > 0 ? "amber" : "slate"}
            note="sell or return these first"
          />
          <Alert
            href="/alerts"
            label="At or below reorder"
            count={lowStock.length}
            tone={outOfStock.length > 0 ? "red" : lowStock.length > 0 ? "amber" : "slate"}
            note={
              outOfStock.length > 0
                ? `${outOfStock.length} completely out`
                : "time to order more"
            }
          />
        </section>

        {report && report.topProducts.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Best sellers in this window
            </h2>
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white text-sm">
              {report.topProducts.map((p) => (
                <li key={p.name} className="flex items-center justify-between px-4 py-2">
                  <span>{p.name}</span>
                  <span className="flex items-center gap-4 text-slate-500">
                    <span className="tabular-nums">{p.qty} sold</span>
                    <span className="tabular-nums text-slate-900">{peso(p.totalCentavos)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {showMoney && sales.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Latest receipts
              </h2>
              <Link href="/receipts" className="text-sm text-slate-500 underline">
                All receipts
              </Link>
            </div>
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white text-sm">
              {sales.map((s) => (
                <li key={s.id} className="flex items-center justify-between px-4 py-2">
                  <Link href={`/receipts/${s.id}`} className="font-mono text-xs text-slate-500 underline">
                    {s.receiptNumber}
                  </Link>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{manilaDate(s.createdAt)}</span>
                    {s.discountType !== "none" && (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs uppercase text-emerald-800">
                        {s.discountType}
                      </span>
                    )}
                    <span className="tabular-nums">{peso(s.totalCentavos)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/*
          BELOW THE WORK, not above it. It renders nothing at all unless this
          browser can install Resceta and has not already.
        */}
        <InstallApp className="mt-10 max-w-md" />
      </main>
    </AppShell>
  );
}

function Alert({
  href,
  label,
  count,
  note,
  tone,
}: {
  href: string;
  label: string;
  count: number;
  note: string;
  tone: "slate" | "amber" | "red";
}) {
  const tones = {
    slate: "border-slate-200 bg-white text-slate-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-900",
  } as const;
  return (
    <Link href={href} className={`block rounded-xl border p-4 hover:shadow-sm ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{count}</p>
      <p className="mt-0.5 text-xs opacity-70">{note}</p>
    </Link>
  );
}
