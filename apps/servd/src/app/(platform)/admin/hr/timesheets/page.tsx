import Link from "next/link";
import { requireHrPage } from "@/server/hr/guard";
import { listTimeEntries, listEmployees } from "@/server/hr/queries";
import { approveTimeEntry } from "@/server/hr/actions";
import { computeHours } from "@/lib/hr/hours";
import { manilaDateTime, manilaTime } from "@/lib/time/manila";
import { manilaDate } from "@/lib/time/manila";

/** "YYYY-MM-DD" → a Date at the start (or end) of that day. Invalid → null. */
function parseDay(v: string | undefined, endOfDay = false): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ employeeId?: string; from?: string; to?: string }>;
}) {
  const { restaurantId, eligible } = await requireHrPage();
  if (!eligible) return <p className="text-sm text-plum-ink/60">HRIS not enabled.</p>;

  const sp = await searchParams;
  // Default window: the last 14 days.
  const defaultTo = new Date();
  const defaultFrom = new Date(defaultTo);
  defaultFrom.setDate(defaultFrom.getDate() - 14);

  const from = parseDay(sp.from) ?? defaultFrom;
  const to = parseDay(sp.to, true) ?? defaultTo;
  const employeeId = sp.employeeId?.trim() || undefined;

  const [entries, employees] = await Promise.all([
    listTimeEntries(restaurantId, from, to, employeeId),
    listEmployees(restaurantId),
  ]);

  const totals = entries.reduce(
    (s, e) => {
      const h = computeHours(e.clockIn, e.clockOut, e.breakMinutes);
      return { hours: s.hours + h.hours, ot: s.ot + h.overtime };
    },
    { hours: 0, ot: 0 },
  );
  const round = (n: number) => Math.round(n * 100) / 100;
  const selected = employees.find((e) => e.id === employeeId);
  const filtered = !!employeeId || !!sp.from || !!sp.to;

  const field = "rounded-lg border border-plum-ink/15 px-3 py-2 text-sm";

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/hr" className="text-sm text-plum-ink/50">← HR</Link>
        <h1 className="font-heading text-2xl font-bold">Timesheets</h1>
        <p className="text-sm text-plum-ink/50">
          {selected ? `${selected.fullName} · ` : ""}
          {manilaDate(from)} – {manilaDate(to)}
        </p>
      </div>

      {/* Filters — plain GET so the view is shareable and survives a refresh. */}
      <form className="flex flex-wrap items-end gap-2 rounded-tile border border-plum-ink/10 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-plum-ink/60">Employee</label>
          <select name="employeeId" defaultValue={employeeId ?? ""} className={`${field} w-56`}>
            <option value="">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.fullName}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-plum-ink/60">From</label>
          <input type="date" name="from" defaultValue={isoDay(from)} className={field} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-plum-ink/60">To</label>
          <input type="date" name="to" defaultValue={isoDay(to)} className={field} />
        </div>
        <button className="rounded-full px-5 py-2 text-sm font-semibold btn-brand">Apply</button>
        {filtered && (
          <Link href="/admin/hr/timesheets" className="px-2 py-2 text-sm font-semibold text-plum-ink/50 hover:text-plum-ink">
            Reset
          </Link>
        )}
      </form>

      {/* Summary for the current filter */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
          <p className="text-xs text-plum-ink/50">Entries</p>
          <p className="font-heading text-2xl font-extrabold">{entries.length}</p>
        </div>
        <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
          <p className="text-xs text-plum-ink/50">Total hours</p>
          <p className="font-heading text-2xl font-extrabold">{round(totals.hours)}</p>
        </div>
        <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
          <p className="text-xs text-plum-ink/50">Overtime</p>
          <p className="font-heading text-2xl font-extrabold text-guava">{round(totals.ot)}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="text-plum-ink/50">
            <tr><th className="p-3">Employee</th><th>In</th><th>Out</th><th>Break</th><th>Hours</th><th>OT</th><th></th></tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const h = computeHours(e.clockIn, e.clockOut, e.breakMinutes);
              return (
                <tr key={e.id} className="border-t border-plum-ink/10">
                  <td className="p-3">{e.employee.fullName}</td>
                  <td>
                    {manilaDateTime(e.clockIn)}
                    {e.clockInPhotoUrl && (
                      <a href={`/api/hr/clock-photo?path=${encodeURIComponent(e.clockInPhotoUrl)}`} target="_blank" rel="noopener" className="ml-1 text-brand-primary" title="Clock-in photo">📷</a>
                    )}
                  </td>
                  <td>
                    {e.clockOut ? manilaTime(e.clockOut) : <span className="text-mango">open</span>}
                    {e.clockOutPhotoUrl && (
                      <a href={`/api/hr/clock-photo?path=${encodeURIComponent(e.clockOutPhotoUrl)}`} target="_blank" rel="noopener" className="ml-1 text-brand-primary" title="Clock-out photo">📷</a>
                    )}
                  </td>
                  <td>{e.breakMinutes}m</td>
                  <td>{h.hours}</td>
                  <td>{h.overtime > 0 ? <span className="text-guava">{h.overtime}</span> : "—"}</td>
                  <td>
                    {e.clockOut && !e.approved ? (
                      <form action={approveTimeEntry}><input type="hidden" name="id" value={e.id} /><button className="text-xs font-semibold text-brand-primary">approve</button></form>
                    ) : e.approved ? <span className="text-xs text-mango">✓</span> : null}
                  </td>
                </tr>
              );
            })}
            {entries.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-plum-ink/40">
                  No time entries for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
