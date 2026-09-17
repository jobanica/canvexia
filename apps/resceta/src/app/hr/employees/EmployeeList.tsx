"use client";

import { useState } from "react";
import { EmployeeForm } from "../EmployeeForm";
import type { EmployeeRow } from "@/server/pharmacy/hr";
import { PAY_TYPE_LABEL, formatWorkStart } from "@/lib/pharmacy/hr";
import { peso, manilaDateTime } from "@/lib/money";

export function EmployeeList({
  rows,
  staff,
}: {
  rows: EmployeeRow[];
  staff: { id: string; displayName: string | null; email: string; role: string }[];
}) {
  const [editing, setEditing] = useState<EmployeeRow | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <>
      <div className="mb-6">
        {editing ? (
          // Keyed on the row being edited: without it React keeps the previous
          // employee's values in the uncontrolled fields, and saving writes
          // one person's pay rate onto another's record.
          <EmployeeForm key={editing.id} employee={editing} staff={staff} onDone={() => setEditing(null)} />
        ) : adding ? (
          <EmployeeForm key={`add-${rows.length}`} staff={staff} onDone={() => setAdding(false)} />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="rounded-lg brand-gradient px-4 py-2 text-sm font-semibold text-white"
          >
            Add an employee
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 text-sm text-slate-300">
          Nobody on the payroll yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl text-sm">
            <thead className="bg-white/[0.06] text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Paid</th>
                <th className="px-4 py-2 font-medium">Starts</th>
                <th className="px-4 py-2 font-medium">Now</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.map((e) => (
                <tr key={e.id} className={e.isActive ? undefined : "opacity-50"}>
                  <td className="px-4 py-2">
                    <span className="font-medium">{e.fullName}</span>
                    {!e.isActive && (
                      <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-xs">off payroll</span>
                    )}
                    <p className="text-xs text-slate-500">
                      {e.position ?? "—"}
                      {e.staffName && ` · signs in as ${e.staffName}`}
                    </p>
                  </td>
                  <td className="px-4 py-2 tabular-nums">
                    {peso(e.payRateCentavos)}
                    <span className="ml-1 text-xs text-slate-500">
                      {PAY_TYPE_LABEL[e.payType].toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-300">
                    {formatWorkStart(e.workStartMinute)}
                    {e.graceMinutes > 0 && (
                      <span className="ml-1 text-xs text-slate-500">+{e.graceMinutes}m grace</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {e.lastPunch?.kind === "clock_in" ? (
                      <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">
                        in
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">out</span>
                    )}
                    {e.lastPunch && (
                      <p className="text-xs text-slate-500">{manilaDateTime(e.lastPunch.at)}</p>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => {
                        setAdding(false);
                        setEditing(e);
                      }}
                      className="text-xs text-slate-500 underline"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
