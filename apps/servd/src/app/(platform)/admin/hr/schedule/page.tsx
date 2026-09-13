import Link from "next/link";
import { requireHrPage } from "@/server/hr/guard";
import { listShifts, listEmployees, listOpenSwaps } from "@/server/hr/queries";
import { createShift, deleteShift, resolveSwap } from "@/server/hr/actions";
import { manilaDateTime, manilaTime } from "@/lib/time/manila";

// Values are JS getDay() (0=Sun…6=Sat); shown Monday-first for PH work weeks.
const WORK_DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

export default async function SchedulePage() {
  const { restaurantId, eligible } = await requireHrPage();
  if (!eligible) return <p className="text-sm text-plum-ink/60">HRIS not enabled.</p>;

  const now = new Date();
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 14);

  const [shifts, employees, swaps] = await Promise.all([
    listShifts(restaurantId, from, to),
    listEmployees(restaurantId),
    listOpenSwaps(restaurantId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/hr" className="text-sm text-plum-ink/50">← HR</Link>
        <h1 className="font-heading text-2xl font-bold">Schedule (next 14 days)</h1>
      </div>

      {swaps.length > 0 && (
        <div className="rounded-tile border border-guava/40 bg-guava/5 p-4">
          <h2 className="font-heading font-bold">Swap requests</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {swaps.map((s) => (
              <li key={s.id} className="flex items-center justify-between">
                <span>{s.employee.fullName} · {manilaDateTime(s.shift.startsAt)}</span>
                <span className="flex gap-2">
                  <form action={resolveSwap}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="approve" value="true" /><button className="text-xs font-semibold text-brand-primary">approve</button></form>
                  <form action={resolveSwap}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="approve" value="false" /><button className="text-xs text-muted">reject</button></form>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form action={createShift} className="space-y-3 rounded-tile border border-plum-ink/10 bg-white p-4">
        <div className="flex flex-wrap items-end gap-2">
          <select name="employeeId" className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm">
            <option value="">Open shift</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
          </select>
          <label className="text-sm text-plum-ink/60">
            <span className="mb-0.5 block text-xs font-semibold">Start</span>
            <input name="start" type="time" required className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm text-plum-ink/60">
            <span className="mb-0.5 block text-xs font-semibold">End</span>
            <input name="end" type="time" required className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm text-plum-ink/60">
            <span className="mb-0.5 block text-xs font-semibold">Repeat for (weeks)</span>
            <input name="weeks" type="number" min={1} max={8} defaultValue={2} className="w-24 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
          </label>
          <input name="role" placeholder="Role (optional)" className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
          <button className="rounded-lg px-4 py-2 text-sm font-semibold btn-brand">Add shift</button>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-plum-ink/60">Working days <span className="font-normal text-plum-ink/40">(unpicked days are days off)</span></p>
          <div className="flex flex-wrap gap-1.5">
            {WORK_DAYS.map((d) => (
              <label key={d.value} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-plum-ink/15 px-3 py-1.5 text-sm has-[:checked]:border-brand-primary has-[:checked]:bg-brand-primary/10 has-[:checked]:font-semibold has-[:checked]:text-brand-primary">
                <input type="checkbox" name="days" value={d.value} />
                {d.label}
              </label>
            ))}
          </div>
        </div>
      </form>

      <ul className="space-y-2">
        {shifts.map((s) => (
          <li key={s.id} className="flex items-center justify-between rounded-tile border border-plum-ink/10 bg-white p-3 text-sm">
            <div>
              <span className="font-medium">{s.employee?.fullName ?? "Open shift"}</span>
              {s.role && <span className="ml-2 text-plum-ink/40">{s.role}</span>}
              <span className="block text-xs text-plum-ink/40">{manilaDateTime(s.startsAt)} – {manilaTime(s.endsAt)}</span>
            </div>
            <form action={deleteShift}><input type="hidden" name="id" value={s.id} /><button className="text-xs text-muted hover:text-guava">delete</button></form>
          </li>
        ))}
        {shifts.length === 0 && <p className="text-sm text-plum-ink/40">No shifts scheduled.</p>}
      </ul>
    </div>
  );
}
