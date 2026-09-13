import Link from "next/link";
import { requireHrPage } from "@/server/hr/guard";
import { featureLockOr } from "@/server/billing/feature-lock-gate";
import { getLateReport } from "@/server/hr/attendance";
import { manilaTime } from "@/lib/time/manila";
import { manilaDate } from "@/lib/time/manila";

const time = manilaTime;

export default async function LateReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; grace?: string }>;
}) {
  const { restaurantId, eligible } = await requireHrPage();
  const locked = await featureLockOr(restaurantId, "hr", "Late & absent");
  if (locked) return locked;

  const sp = await searchParams;
  const today = new Date();
  const defFrom = new Date(today);
  defFrom.setDate(defFrom.getDate() - 13);

  const from = sp.from ? new Date(`${sp.from}T00:00:00`) : new Date(defFrom.setHours(0, 0, 0, 0));
  const to = sp.to ? new Date(`${sp.to}T23:59:59`) : new Date(today.setHours(23, 59, 59, 999));
  const grace = Math.max(0, Number(sp.grace) || 5);

  const rows = await getLateReport(restaurantId, from, to, grace);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/hr" className="text-sm text-plum-ink/50">← HR</Link>
        <h1 className="font-heading text-2xl font-bold">Late report</h1>
        <p className="text-sm text-plum-ink/50">
          Clock-ins later than the scheduled shift start (+ grace). Needs scheduled shifts.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-tile border border-plum-ink/10 bg-white p-4">
        <label className="text-sm">From
          <input type="date" name="from" defaultValue={fromStr} className="mt-1 block rounded-lg border border-plum-ink/15 px-3 py-2" />
        </label>
        <label className="text-sm">To
          <input type="date" name="to" defaultValue={toStr} className="mt-1 block rounded-lg border border-plum-ink/15 px-3 py-2" />
        </label>
        <label className="text-sm">Grace (min)
          <input type="number" name="grace" min={0} defaultValue={grace} className="mt-1 block w-24 rounded-lg border border-plum-ink/15 px-3 py-2" />
        </label>
        <button className="rounded-full px-5 py-2 text-sm font-semibold btn-brand">Apply</button>
      </form>

      <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <p className="mb-3 text-sm text-plum-ink/60">
          <span className="font-semibold">{rows.length}</span> late arrival{rows.length === 1 ? "" : "s"}
        </p>
        {rows.length === 0 ? (
          <p className="text-sm text-plum-ink/50">No late arrivals in this range. 🎉</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-plum-ink/50">
                <tr className="border-b border-plum-ink/10">
                  <th className="py-2">Employee</th>
                  <th>Date</th>
                  <th>Shift start</th>
                  <th>Clocked in</th>
                  <th className="text-right">Late by</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-plum-ink/5">
                    <td className="py-2 font-medium">{r.name}</td>
                    <td>{manilaDate(r.date)}</td>
                    <td>{time(r.shiftStart)}</td>
                    <td>{time(r.clockIn)}</td>
                    <td className="text-right font-semibold text-guava">{r.minutesLate} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
