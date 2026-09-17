"use client";

import { useActionState } from "react";
import { saveEmployeeAction, type HrState } from "./actions";
import { PAY_TYPE_LABEL, formatWorkStart } from "@/lib/pharmacy/hr";
import type { EmployeeRow } from "@/server/pharmacy/hr";

const IDLE: HrState = { status: "idle" };
const FIELD = "mt-1 w-full rounded-xl border border-white/10 px-3 py-2 text-sm";
const LABEL = "block text-xs font-semibold uppercase tracking-wide text-slate-500";

/**
 * The employment record.
 *
 * SEPARATE FROM THE LOGIN, and linked to one only optionally. A rider on the
 * payroll never signs into the till; a pay rate has no business sitting on an
 * authentication row that every staff screen reads.
 */
export function EmployeeForm({
  employee,
  staff,
  onDone,
}: {
  employee?: EmployeeRow;
  staff: { id: string; displayName: string | null; email: string; role: string }[];
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState(saveEmployeeAction, IDLE);

  return (
    <form action={action} className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-5">
      {employee && <input type="hidden" name="employeeId" value={employee.id} />}
      <p className="text-sm font-semibold">
        {employee ? `Edit ${employee.fullName}` : "Add an employee"}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          Full name
          <input name="fullName" required maxLength={200} defaultValue={employee?.fullName ?? ""} className={FIELD} />
        </label>
        <label className={LABEL}>
          Position
          <input name="position" maxLength={120} defaultValue={employee?.position ?? ""} className={FIELD} />
        </label>
        <label className={LABEL}>
          Mobile
          <input name="phone" maxLength={40} defaultValue={employee?.phone ?? ""} className={FIELD} />
        </label>
        <label className={LABEL}>
          Email
          <input name="email" maxLength={200} defaultValue={employee?.email ?? ""} className={FIELD} />
        </label>

        <label className={LABEL}>
          Paid
          <select name="payType" defaultValue={employee?.payType ?? "monthly"} className={FIELD}>
            {(["hourly", "daily", "monthly"] as const).map((t) => (
              <option key={t} value={t}>
                {PAY_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          Rate ₱
          <input
            name="payRate"
            type="number"
            min={0}
            step="0.01"
            required
            defaultValue={employee ? (employee.payRateCentavos / 100).toFixed(2) : ""}
            className={FIELD}
          />
        </label>

        <label className={LABEL}>
          Starts work at
          <input
            name="workStart"
            type="time"
            defaultValue={formatWorkStart(employee?.workStartMinute ?? 540)}
            className={FIELD}
          />
        </label>
        <label className={LABEL}>
          {/*
            A real policy, and one that has to be recorded — otherwise every
            payroll argument is about what the grace period was.
          */}
          Grace, minutes
          <input
            name="graceMinutes"
            type="number"
            min={0}
            step={1}
            defaultValue={employee?.graceMinutes ?? 0}
            className={FIELD}
          />
        </label>

        <label className={LABEL}>
          Hours per day
          <input
            name="hoursPerDay"
            type="number"
            min={0}
            max={24}
            step={1}
            defaultValue={employee?.hoursPerDay ?? 8}
            className={FIELD}
          />
        </label>
        <label className={LABEL}>
          Hired
          <input
            name="hireDate"
            type="date"
            defaultValue={employee?.hireDate ? employee.hireDate.toISOString().slice(0, 10) : ""}
            className={FIELD}
          />
        </label>

        <label className={`${LABEL} sm:col-span-2`}>
          Their Resceta login, if they have one
          <select name="staffId" defaultValue={employee?.staffId ?? ""} className={FIELD}>
            <option value="">No login</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName ?? s.email} · {s.role}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className={`${LABEL} mt-3 block`}>
        Notes
        <input name="notes" maxLength={1000} defaultValue={employee?.notes ?? ""} className={FIELD} />
      </label>

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={employee?.isActive ?? true} />
        On the payroll
      </label>

      <div className="mt-4 flex items-center gap-3">
        <button
          disabled={pending}
          className="rounded-lg brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {pending ? "Saving…" : employee ? "Save changes" : "Add employee"}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className="text-sm text-slate-500 underline">
            Cancel
          </button>
        )}
        {state.status === "error" && <span className="text-sm text-red-300">{state.message}</span>}
        {state.status === "done" && (
          <span className="text-sm text-emerald-300">{state.message}</span>
        )}
      </div>
    </form>
  );
}
