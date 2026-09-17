"use client";

import { useActionState } from "react";
import { fileLeave, decideLeave, type HrState } from "../actions";
import { LEAVE_LABEL, leaveDays } from "@/lib/pharmacy/hr";
import { manilaDate } from "@/lib/money";

const IDLE: HrState = { status: "idle" };
const FIELD = "mt-1 w-full rounded-xl border border-white/10 px-3 py-2 text-sm";
const LABEL = "block text-xs font-semibold uppercase tracking-wide text-slate-500";

const KINDS = ["vacation", "sick", "emergency", "unpaid", "maternity", "paternity"] as const;

export function LeaveForm({
  employees,
}: {
  employees: { id: string; fullName: string }[];
}) {
  const [state, action, pending] = useActionState(fileLeave, IDLE);

  return (
    <form action={action} className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-5">
      <p className="text-sm font-semibold">File a leave request</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          Who
          <select name="employeeId" required className={FIELD} defaultValue="">
            <option value="">Pick an employee…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.fullName}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          Kind
          <select name="leaveType" className={FIELD} defaultValue="vacation">
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {LEAVE_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          From
          <input name="startDate" type="date" required className={FIELD} />
        </label>
        <label className={LABEL}>
          To
          <input name="endDate" type="date" required className={FIELD} />
        </label>
      </div>
      <label className={`${LABEL} mt-3 block`}>
        Reason
        <input name="reason" maxLength={500} className={FIELD} />
      </label>
      <div className="mt-4 flex items-center gap-3">
        <button
          disabled={pending}
          className="rounded-lg brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {pending ? "Filing…" : "File it"}
        </button>
        {state.status === "error" && <span className="text-sm text-red-300">{state.message}</span>}
        {state.status === "done" && (
          <span className="text-sm text-emerald-300">{state.message}</span>
        )}
      </div>
    </form>
  );
}

/**
 * Approving or rejecting.
 *
 * Two buttons in one form, distinguished by the `value` on the submit. A
 * decision is a single act with two outcomes — splitting it into two forms
 * means two places for the request id to be wrong.
 */
export function LeaveDecision({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(decideLeave, IDLE);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      <input
        name="reviewNote"
        maxLength={300}
        placeholder="Note (optional)"
        className="rounded-xl border border-white/10 px-2 py-1 text-xs"
      />
      <button
        name="decision"
        value="approved"
        disabled={pending}
        className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
      >
        Approve
      </button>
      <button
        name="decision"
        value="rejected"
        disabled={pending}
        className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold disabled:opacity-40"
      >
        Reject
      </button>
      {state.status === "error" && <span className="text-xs text-red-300">{state.message}</span>}
    </form>
  );
}

export function LeaveRow({
  request,
  canDecide,
}: {
  request: {
    id: string;
    leaveType: string;
    startDate: Date;
    endDate: Date;
    reason: string | null;
    status: string;
    reviewNote: string | null;
    employee: { fullName: string; position: string | null };
  };
  canDecide: boolean;
}) {
  const days = leaveDays(request.startDate, request.endDate);
  const tone =
    request.status === "approved"
      ? "bg-emerald-500/15 text-emerald-300"
      : request.status === "rejected"
        ? "bg-red-500/15 text-red-300"
        : "bg-amber-500/15 text-amber-200";

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span>
          <span className="font-medium">{request.employee.fullName}</span>
          <span className="ml-2 text-sm text-slate-500">
            {LEAVE_LABEL[request.leaveType] ?? request.leaveType} ·{" "}
            {manilaDate(request.startDate)} – {manilaDate(request.endDate)} · {days} day
            {days === 1 ? "" : "s"}
          </span>
        </span>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${tone}`}>{request.status}</span>
      </div>
      {request.reason && <p className="mt-1 text-sm text-slate-300">{request.reason}</p>}
      {request.reviewNote && (
        <p className="mt-1 text-xs text-slate-500">Reviewer: {request.reviewNote}</p>
      )}
      {request.status === "pending" && canDecide && (
        <div className="mt-2">
          <LeaveDecision requestId={request.id} />
        </div>
      )}
    </li>
  );
}
