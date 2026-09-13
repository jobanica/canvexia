import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { featureLockOr } from "@/server/billing/feature-lock-gate";
import { getSalesReport, getVatReport, getCogs, getExpenses, getSalesTickets } from "@/server/accounting/queries";
import { formatPeso } from "@/lib/money";
import { parseReportRange } from "@/lib/time/report-range";
import { DateRangePicker } from "@/components/admin/DateRangePicker";
import { manilaDate } from "@/lib/time/manila";

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash", card_terminal: "Card (terminal)", gcash: "GCash (counter)", maya: "Maya (counter)",
  online_gcash: "GCash (online)", online_card: "Card (online)",
  // bank_transfer was missing here and showed as the raw enum value on this
  // page alone — the four label maps had already drifted.
  bank_transfer: "Bank transfer",
  third_party: "Third-party app (Grab/Foodpanda)",
};

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { restaurantId } = await requireAdminPage();
  const locked = await featureLockOr(restaurantId, "accounting", "Accounting");
  if (locked) return locked;
  const sp = await searchParams;
  const reportRange = parseReportRange(sp);
  const { from, to } = reportRange;

  const [sales, vat, cogs, expenses, ticketList] = await Promise.all([
    getSalesReport(restaurantId, from, to),
    getVatReport(restaurantId, from, to),
    getCogs(restaurantId, from, to),
    getExpenses(restaurantId, from, to),
    getSalesTickets(restaurantId, from, to),
  ]);
  const { tickets, voided } = ticketList;
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const profit = sales.gross - cogs - expenseTotal;


  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/admin" className="text-sm text-plum-ink/50">← Dashboard</Link>
            <h1 className="font-heading text-2xl font-bold">Accounting</h1>
          </div>
          <Link href="/admin/accounting/expenses" className="rounded-full border border-plum-ink/15 px-3 py-1 text-sm font-semibold">Expenses →</Link>
        </div>
        <DateRangePicker range={reportRange} basePath="/admin/accounting" />
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Sales collected" value={formatPeso(sales.gross)} hint={`${sales.orderCount} tickets · after discounts`} />
        <Kpi label="Discounts" value={formatPeso(sales.discounts)} />
        <Kpi label="Expenses" value={formatPeso(expenseTotal)} />
        <Kpi label="Net profit" value={formatPeso(profit)} hint="Sales − COGS − expenses" accent={profit < 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Payment mix */}
        <Card title="Sales by payment method">
          {sales.byMethod.length === 0 ? <Empty /> : (
            <ul className="space-y-2 text-sm">
              {sales.byMethod.map((m) => (
                <li key={m.method} className="flex justify-between">
                  <span>{METHOD_LABEL[m.method] ?? m.method} <span className="text-plum-ink/40">×{m.count}</span></span>
                  <span className="font-semibold">{formatPeso(m.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* VAT */}
        <Card title="VAT (12%)">
          <dl className="space-y-1.5 text-sm">
            <Row k="Total sales" v={formatPeso(vat.totalSales)} />
            <Row k="VAT-exempt (Senior/PWD)" v={formatPeso(vat.exemptSales)} />
            <Row k="VATable sales (gross)" v={formatPeso(vat.vatableGross)} />
            <Row k="Net of VAT" v={formatPeso(vat.netOfVat)} />
            <Row k="VAT" v={formatPeso(vat.vat)} bold />
          </dl>
        </Card>
      </div>

      {/* P&L */}
      <Card title="Profit & Loss">
        <dl className="space-y-1.5 text-sm">
          <Row k="Revenue (sales)" v={formatPeso(sales.gross)} />
          <Row k="Cost of goods sold (inventory)" v={`−${formatPeso(cogs)}`} />
          <Row k="Operating expenses" v={`−${formatPeso(expenseTotal)}`} />
          <Row k="Net profit" v={formatPeso(profit)} bold />
        </dl>
        <p className="mt-2 text-xs text-plum-ink/45">COGS reflects recorded inventory usage; statutory taxes are not deducted here.</p>
      </Card>

      {/* Every ticket behind the total. Exists so a figure that disagrees with
          the owner's own tally can be found instead of argued about. */}
      <Card title="Every ticket in this period">
        {tickets.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-plum-ink/50">
                <tr>
                  <th className="py-1">Ticket</th>
                  <th>Paid at</th>
                  <th className="text-right">Ticket total</th>
                  <th className="text-right">Discount</th>
                  <th className="text-right">Collected</th>
                  <th>Method</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.orderId} className="border-t border-plum-ink/5">
                    <td className="py-1.5 font-medium">{t.label}</td>
                    <td className="whitespace-nowrap text-plum-ink/60">{t.paidAt}</td>
                    <td className="text-right tabular-nums text-plum-ink/60">{formatPeso(t.gross)}</td>
                    <td className="text-right tabular-nums text-plum-ink/60">
                      {t.discount > 0 ? `−${formatPeso(t.discount)}` : "—"}
                    </td>
                    <td className="text-right font-semibold tabular-nums">{formatPeso(t.paid)}</td>
                    <td className="whitespace-nowrap text-xs text-plum-ink/55">
                      {t.methods.map((m) => METHOD_LABEL[m] ?? m).join(" + ")}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-plum-ink/15 font-bold">
                  <td className="py-2" colSpan={4}>Total ({tickets.length} tickets)</td>
                  <td className="text-right tabular-nums">{formatPeso(sales.gross)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-plum-ink/45">
          This adds up to Sales collected, exactly. A ticket on your own list that isn&apos;t here
          was either voided (below) or never settled.
        </p>
      </Card>

      {voided.length > 0 && (
        <Card title={`Voided in this period (${voided.length})`}>
          <table className="w-full text-left text-sm">
            <thead className="text-plum-ink/50">
              <tr><th className="py-1">Ticket</th><th>Voided</th><th className="text-right">Reversed</th></tr>
            </thead>
            <tbody>
              {voided.map((v) => (
                <tr key={v.orderId} className="border-t border-plum-ink/5">
                  <td className="py-1.5 font-medium">{v.label}</td>
                  <td className="whitespace-nowrap text-plum-ink/60">{v.at}</td>
                  <td className="text-right tabular-nums text-guava">−{formatPeso(v.reversed)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-plum-ink/15 font-bold">
                <td className="py-2" colSpan={2}>Total reversed</td>
                <td className="text-right tabular-nums text-guava">
                  −{formatPeso(voided.reduce((s, v) => s + v.reversed, 0))}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-plum-ink/45">
            These were rung up and then cancelled, so the money came back out. They count on a
            hand-written list and correctly don&apos;t count here — usually the whole difference.
          </p>
        </Card>
      )}

      {/* Z-report (daily) */}
      <Card title="Daily sales (Z-report)">
        {sales.byDay.length === 0 ? <Empty /> : (
          <table className="w-full text-left text-sm">
            <thead className="text-plum-ink/50"><tr><th className="py-1">Date</th><th className="text-right">Orders</th><th className="text-right">Sales</th></tr></thead>
            <tbody>
              {sales.byDay.map((d) => (
                <tr key={d.day} className="border-t border-plum-ink/5">
                  <td className="py-1.5">{manilaDate(d.day)}</td>
                  <td className="text-right">{d.orders}</td>
                  <td className="text-right font-semibold">{formatPeso(d.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Kpi({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={`rounded-tile border p-5 ${accent ? "border-guava bg-guava/5" : "border-plum-ink/10 bg-white"}`}>
      <p className="text-xs font-medium text-plum-ink/50">{label}</p>
      <p className={`mt-1 font-heading text-2xl font-extrabold ${accent ? "text-guava" : ""}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-plum-ink/40">{hint}</p>}
    </div>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
      <h2 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-plum-ink/55">{title}</h2>
      {children}
    </div>
  );
}
function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "border-t border-plum-ink/10 pt-1.5 font-heading font-bold" : ""}`}>
      <dt className="text-plum-ink/60">{k}</dt><dd>{v}</dd>
    </div>
  );
}
function Empty() {
  return <p className="py-4 text-center text-sm text-plum-ink/40">No data for this period.</p>;
}
