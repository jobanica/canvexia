import Link from "next/link";
import { requireHrPage } from "@/server/hr/guard";
import { listLeaveTypes, listLeaveRequests, listEmployees } from "@/server/hr/queries";
import { createLeaveType, requestLeave, resolveLeave } from "@/server/hr/actions";
import { manilaDate } from "@/lib/time/manila";

export default async function LeavePage() {
  const { restaurantId, eligible } = await requireHrPage();
  if (!eligible) return <p className="text-sm text-plum-ink/60">HRIS not enabled.</p>;

  const [types, requests, employees] = await Promise.all([
    listLeaveTypes(restaurantId),
    listLeaveRequests(restaurantId),
    listEmployees(restaurantId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/hr" className="text-sm text-plum-ink/50">← HR</Link>
        <h1 className="font-heading text-2xl font-bold">Leave</h1>
      </div>

      <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
        <h2 className="font-heading font-bold">Leave types</h2>
        <form action={createLeaveType} className="mt-2 flex items-center gap-2">
          <input name="name" placeholder="e.g. Vacation" required className="flex-1 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="isPaid" defaultChecked /> paid</label>
          <button className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold">Add</button>
        </form>
        <ul className="mt-2 text-sm text-plum-ink/70">
          {types.map((t) => <li key={t.id}>{t.name} {t.isPaid ? "" : "(unpaid)"}</li>)}
        </ul>
      </div>

      {types.length > 0 && employees.length > 0 && (
        <form action={requestLeave} className="flex flex-wrap items-end gap-2 rounded-tile border border-plum-ink/10 bg-white p-4">
          <select name="employeeId" required className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm">
            <option value="">Employee…</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
          </select>
          <select name="leaveTypeId" required className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm">
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input name="startDate" type="date" required className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
          <input name="endDate" type="date" required className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
          <button className="rounded-lg px-4 py-2 text-sm font-semibold btn-brand">File request</button>
        </form>
      )}

      <ul className="space-y-2">
        {requests.map((r) => (
          <li key={r.id} className="flex items-center justify-between rounded-tile border border-plum-ink/10 bg-white p-3 text-sm">
            <div>
              <span className="font-medium">{r.employee.fullName}</span> · {r.leaveType.name}
              <span className="block text-xs text-plum-ink/40">{manilaDate(r.startDate)} – {manilaDate(r.endDate)} · {r.status}</span>
            </div>
            {r.status === "pending" && (
              <span className="flex gap-2">
                <form action={resolveLeave}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="approve" value="true" /><button className="text-xs font-semibold text-brand-primary">approve</button></form>
                <form action={resolveLeave}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="approve" value="false" /><button className="text-xs text-muted">reject</button></form>
              </span>
            )}
          </li>
        ))}
        {requests.length === 0 && <p className="text-sm text-plum-ink/40">No leave requests.</p>}
      </ul>
    </div>
  );
}
