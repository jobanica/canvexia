import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHrPage } from "@/server/hr/guard";
import { getEmployee, listLeaveTypes } from "@/server/hr/queries";
import { qrSvg } from "@/lib/qr";
import { formatPeso } from "@/lib/money";
import {
  updateEmployee,
  uploadDocument,
  deleteDocument,
  setAvailability,
  deleteAvailability,
  setLeaveBalance,
  deleteEmployee,
} from "@/server/hr/actions";
import { ConfirmSubmitButton } from "@/components/admin/ConfirmSubmitButton";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { restaurantId, eligible } = await requireHrPage();
  if (!eligible) notFound();
  const [employee, leaveTypes] = await Promise.all([
    getEmployee(restaurantId, id),
    listLeaveTypes(restaurantId),
  ]);
  if (!employee) notFound();

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const clockSvg = await qrSvg(`${base}/clock/${employee.clockToken}`);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/admin/hr" className="text-sm text-plum-ink/50">← Employees</Link>
        <h1 className="font-heading text-2xl font-bold">{employee.fullName}</h1>
      </div>

      {/* Profile */}
      <form action={updateEmployee} className="space-y-3 rounded-tile border border-plum-ink/10 bg-white p-5">
        <input type="hidden" name="id" value={employee.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Name<input name="fullName" defaultValue={employee.fullName} className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2" /></label>
          <label className="text-sm">Title<input name="title" defaultValue={employee.title ?? ""} className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2" /></label>
          <label className="text-sm">Pay rate (₱)<input name="payPesos" type="number" step="0.01" defaultValue={(employee.payRate / 100).toFixed(2)} className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2" /></label>
          <label className="text-sm">Pay type
            <select name="payType" defaultValue={employee.payType} className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2">
              <option value="hourly">Hourly</option><option value="daily">Daily</option><option value="monthly">Monthly</option>
            </select>
          </label>
          <label className="text-sm">Phone (login)<input name="phone" defaultValue={(employee.contactJson as { phone?: string } | null)?.phone ?? ""} className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2" /></label>
          <label className="text-sm">PIN (login + clock)<input name="clockPin" defaultValue={employee.clockPin ?? ""} className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2" /></label>
          <label className="text-sm">Status
            <select name="status" defaultValue={employee.status} className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2">
              <option value="active">Active</option><option value="inactive">Inactive</option>
            </select>
          </label>
        </div>
        <button className="rounded-lg px-4 py-2 text-sm font-semibold btn-brand">Save</button>
      </form>

      {/* Clock QR */}
      <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="font-heading text-lg font-bold">Clock-in QR</h2>
        <p className="text-sm text-plum-ink/50">The employee scans this to clock in/out.</p>
        <div className="mt-3 h-40 w-40" dangerouslySetInnerHTML={{ __html: clockSvg }} />
      </div>

      {/* Documents */}
      <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="font-heading text-lg font-bold">Documents</h2>
        <form action={uploadDocument} className="mt-2 flex items-center gap-2">
          <input type="hidden" name="employeeId" value={employee.id} />
          <input type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="text-xs" />
          <button className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold">Upload</button>
        </form>
        <ul className="mt-3 space-y-1 text-sm">
          {employee.documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between">
              <a href={d.url} target="_blank" rel="noopener" className="text-brand-primary underline">{d.name}</a>
              <form action={deleteDocument}>
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="employeeId" value={employee.id} />
                <button className="text-xs text-muted hover:text-guava">remove</button>
              </form>
            </li>
          ))}
          {employee.documents.length === 0 && <li className="text-plum-ink/40">No documents.</li>}
        </ul>
      </div>

      {/* Availability */}
      <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="font-heading text-lg font-bold">Availability</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {employee.availability.map((a) => (
            <li key={a.id} className="flex items-center justify-between">
              <span>{DAYS[a.dayOfWeek]} {hhmm(a.startMinute)}–{hhmm(a.endMinute)}</span>
              <form action={deleteAvailability}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="employeeId" value={employee.id} />
                <button className="text-xs text-muted hover:text-guava">remove</button>
              </form>
            </li>
          ))}
          {employee.availability.length === 0 && <li className="text-plum-ink/40">No availability set.</li>}
        </ul>
        <form action={setAvailability} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="employeeId" value={employee.id} />
          <select name="dayOfWeek" className="rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm">
            {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
          <input name="start" type="time" defaultValue="09:00" className="rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm" />
          <input name="end" type="time" defaultValue="17:00" className="rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm" />
          <button className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold">Add</button>
        </form>
      </div>

      {/* Leave balances */}
      <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="font-heading text-lg font-bold">Leave balances</h2>
        {leaveTypes.length === 0 ? (
          <p className="mt-2 text-sm text-plum-ink/40">Create leave types first.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {leaveTypes.map((lt) => {
              const bal = employee.leaveBalances.find((b) => b.leaveTypeId === lt.id);
              return (
                <form key={lt.id} action={setLeaveBalance} className="flex items-center gap-2 text-sm">
                  <input type="hidden" name="employeeId" value={employee.id} />
                  <input type="hidden" name="leaveTypeId" value={lt.id} />
                  <span className="flex-1">{lt.name}</span>
                  <input name="balance" type="number" step="0.5" defaultValue={bal?.balance ?? 0} className="w-20 rounded-lg border border-plum-ink/15 px-2 py-1" />
                  <span className="text-xs text-plum-ink/40">days</span>
                  <button className="rounded-lg border border-plum-ink/15 px-2 py-1 text-xs font-semibold">Set</button>
                </form>
              );
            })}
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div className="rounded-tile border border-guava/30 bg-guava/5 p-5">
        <h2 className="font-heading text-lg font-bold text-guava">Danger zone</h2>
        <p className="mt-1 text-sm text-plum-ink/60">
          Deleting removes this employee and their attendance, time entries, leave, and documents.
          To keep records instead, set their status to <span className="font-semibold">inactive</span> above.
        </p>
        <form action={deleteEmployee} className="mt-3">
          <input type="hidden" name="id" value={employee.id} />
          <ConfirmSubmitButton
            confirmText={`Delete ${employee.fullName}? This permanently removes their attendance and HR records and can't be undone.`}
            className="rounded-full bg-guava px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Delete employee
          </ConfirmSubmitButton>
        </form>
      </div>
    </div>
  );
}
