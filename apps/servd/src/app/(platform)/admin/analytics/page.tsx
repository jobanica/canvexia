import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { getAnalytics } from "@/server/analytics/queries";
import { parseReportRange } from "@/lib/time/report-range";
import { DateRangePicker } from "@/components/admin/DateRangePicker";
import { formatPeso } from "@/lib/money";
import {
  RevenueChart,
  RatingTrendChart,
  PeakHoursChart,
  PaymentMixChart,
} from "@/components/analytics/Charts";

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
      <p className="text-xs text-plum-ink/50">{label}</p>
      <p className="font-heading text-2xl font-extrabold">{value}</p>
    </div>
  );
}

function ItemTable({ title, rows }: { title: string; rows: { name: string; qty: number; revenue: number }[] }) {
  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
      <h3 className="font-heading font-bold">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-plum-ink/40">No sales yet.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {rows.map((r) => (
            <li key={r.name} className="flex justify-between">
              <span>{r.name} <span className="text-plum-ink/40">×{r.qty}</span></span>
              <span className="font-medium">{formatPeso(r.revenue)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { restaurantId } = await requireAdminPage();
  const sp = await searchParams;
  const range = parseReportRange(sp);
  const a = await getAnalytics(restaurantId, range.from, range.to);
  // Carry the chosen window into the CSV link, so an export matches what's on
  // screen instead of quietly falling back to a preset.
  const exportQuery =
    range.preset === "custom"
      ? `from=${range.fromKey}&to=${range.toKey}`
      : `range=${range.preset}`;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/admin" className="text-sm text-plum-ink/50">← Dashboard</Link>
            <h1 className="font-heading text-2xl font-bold">Analytics</h1>
          </div>
          <a
            href={`/admin/analytics/export?type=orders&${exportQuery}`}
            className="rounded-full border border-plum-ink/15 px-3 py-1 text-sm font-semibold"
          >
            Export CSV
          </a>
        </div>
        <DateRangePicker range={range} basePath="/admin/analytics" />
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Kpi label="Revenue" value={formatPeso(a.summary.revenue)} />
        <Kpi label="Paid orders" value={String(a.summary.orders)} />
        <Kpi label="Avg order value" value={formatPeso(a.summary.aov)} />
        <Kpi
          label="Avg rating"
          value={a.summary.avgRating !== null ? `${a.summary.avgRating} ★ (${a.summary.ratingCount})` : "—"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
          <h3 className="mb-2 font-heading font-bold">Revenue</h3>
          <RevenueChart data={a.revenueByDay} />
        </div>
        <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
          <h3 className="mb-2 font-heading font-bold">Rating trend</h3>
          <RatingTrendChart data={a.ratingTrend} />
        </div>
        <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
          <h3 className="mb-2 font-heading font-bold">Peak hours (UTC)</h3>
          <PeakHoursChart data={a.peakHours} />
        </div>
        <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
          <h3 className="mb-2 font-heading font-bold">Payment mix</h3>
          <PaymentMixChart data={a.paymentMix} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ItemTable title="Best sellers" rows={a.topItems} />
        <ItemTable title="Slowest movers" rows={a.worstItems} />
      </div>
    </div>
  );
}
