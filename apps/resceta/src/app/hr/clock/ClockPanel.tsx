"use client";

import { useActionState } from "react";
import { punchAction, type HrState } from "./../actions";
import { manilaDateTime } from "@/lib/money";

const IDLE: HrState = { status: "idle" };

export interface ClockRow {
  id: string;
  fullName: string;
  position: string | null;
  isIn: boolean;
  lastAt: Date | null;
}

/**
 * Clocking in and out.
 *
 * ONE BUTTON PER PERSON, and it says what it will do. The direction is derived
 * on the server from the last punch — a screen with both buttons produces two
 * clock-ins in a row the first time somebody double-taps, and the timesheet
 * then shows a day with no end.
 */
export function ClockPanel({ rows }: { rows: ClockRow[] }) {
  const [state, action, pending] = useActionState(punchAction, IDLE);

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        Nobody on the payroll yet. Add employees first.
      </p>
    );
  }

  return (
    <>
      {state.status === "error" && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.message}</p>
      )}
      {state.status === "done" && (
        <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{state.message}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <form
            key={r.id}
            action={action}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4"
          >
            <input type="hidden" name="employeeId" value={r.id} />
            <div>
              <p className="font-medium">{r.fullName}</p>
              <p className="text-xs text-slate-500">
                {r.position ?? "—"}
                {r.lastAt && ` · last ${manilaDateTime(r.lastAt)}`}
              </p>
            </div>
            <button
              disabled={pending}
              className={`rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 ${
                r.isIn ? "bg-slate-600" : "bg-emerald-600"
              }`}
            >
              {r.isIn ? "Clock out" : "Clock in"}
            </button>
          </form>
        ))}
      </div>
    </>
  );
}
