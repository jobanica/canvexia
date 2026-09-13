import Link from "next/link";
import { requireHrPage } from "@/server/hr/guard";
import { featureLockOr } from "@/server/billing/feature-lock-gate";
import { getStaffPerformance } from "@/server/hr/performance";
import { formatPeso } from "@/lib/money";

export default async function StaffPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { restaurantId, eligible } = await requireHrPage();
  const locked = await featureLockOr(restaurantId, "hr", "Performance");
  if (locked) return locked;

  const sp = await searchParams;
  const today = new Date();
  const defFrom = new Date(today);
  defFrom.setDate(defFrom.getDate() - 29);
  const from = sp.from ? new Date(`${sp.from}T00:00:00`) : new Date(defFrom.setHours(0, 0, 0, 0));
  const to = sp.to ? new Date(`${sp.to}T23:59:59`) : new Date(today.setHours(23, 59, 59, 999));
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  const { rows, ops } = await getStaffPerformance(restaurantId, from, to);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/hr" className="text-sm text-plum-ink/50">← HR</Link>
        <h1 className="font-heading text-2xl font-bold">Staff performance</h1>
        <p className="text-sm text-plum-ink/50">
          Attendance, hours and lateness per employee, plus service KPIs for the period.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-2 rounded-tile border border-plum-ink/10 bg-white p-4 text-sm">
        <label>
          <span className="block text-xs text-plum-ink/50">From</span>
          <input type="date" name="from" defaultValue={fromStr} className="rounded-lg border border-plum-ink/15 px-3 py-2" />
        </label>
        <label>
          <span className="block text-xs text-plum-ink/50">To</span>
          <input type="date" name="to" defaultValue={toStr} className="rounded-lg border border-plum-ink/15 px-3 py-2" />
        </label>
        <button className="rounded-full border border-plum-ink/15 px-4 py-2 font-semibold">Apply</button>
      </form>

      {/* Service KPIs (restaurant-level) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Avg handling time" value={`${ops.avgHandlingMin} min`} hint={`${ops.ordersServed} served`} />
        <Kpi label="Avg order value" value={formatPeso(ops.avgOrderValue)} hint={`${ops.paidOrders} paid`} />
        <Kpi label="Items / order" value={`${ops.avgItemsPerOrder}`} hint="upsell proxy" />
        <Kpi label="Orders served" value={`${ops.ordersServed}`} hint="in period" />
      </div>

      {/* Per-employee */}
      <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-plum-ink/45">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Days</th>
              <th className="px-4 py-3">Hours</th>
              <th className="px-4 py-3">Late</th>
              <th className="px-4 py-3">Avg late</th>
              <th className="px-4 py-3">Leave days</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-plum-ink/5">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-plum-ink/50">No employees yet.</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.employeeId}>
                  <td className="px-4 py-2.5 font-medium">{r.name}</td>
                  <td className="px-4 py-2.5">{r.daysWorked}</td>
                  <td className="px-4 py-2.5">{r.hours}</td>
                  <td className="px-4 py-2.5">
                    {r.lateCount > 0 ? <span className="font-semibold text-guava">{r.lateCount}×</span> : "—"}
                  </td>
                  <td className="px-4 py-2.5">{r.lateCount > 0 ? `${Math.round(r.lateMinutes / r.lateCount)} min` : "—"}</td>
                  <td className="px-4 py-2.5">{r.leaveDays || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
      <p className="text-xs text-plum-ink/50">{label}</p>
      <p className="font-heading text-2xl font-extrabold">{value}</p>
      {hint && <p className="text-xs text-plum-ink/40">{hint}</p>}
    </div>
  );
}
