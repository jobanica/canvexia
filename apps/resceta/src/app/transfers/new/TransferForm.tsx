"use client";

import { useActionState, useState } from "react";
import { sendTransfer, type TransferState } from "../actions";

const IDLE: TransferState = { status: "idle" };
const FIELD = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm";

export interface TransferBatch {
  id: string;
  label: string;
  quantity: number;
}

/**
 * Sending stock to another branch.
 *
 * BATCHES, NOT PRODUCTS. The lot number and expiry travel with the goods, so
 * what is being sent has to be a specific batch — a transfer of "20
 * paracetamol" leaves both branches' expiry profiles wrong, which is the one
 * thing this system exists to keep right.
 */
export function TransferForm({
  branches,
  fromBranchId,
  batches,
}: {
  branches: { id: string; name: string }[];
  fromBranchId: string;
  batches: TransferBatch[];
}) {
  const [state, action, pending] = useActionState(sendTransfer, IDLE);
  const [to, setTo] = useState("");

  const destinations = branches.filter((b) => b.id !== fromBranchId);

  if (destinations.length === 0) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        There is only one branch, so there is nowhere to transfer to. Open
        another under Branches first.
      </p>
    );
  }

  if (batches.length === 0) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        Nothing on the shelf at this branch to send.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="fromBranchId" value={fromBranchId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          To branch
          <select
            name="toBranchId"
            required
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={`mt-1 ${FIELD}`}
          >
            <option value="">Pick a branch…</option>
            {destinations.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Notes
          <input name="notes" maxLength={500} className={`mt-1 ${FIELD}`} />
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Batch</th>
              <th className="px-4 py-2 text-right font-medium">On hand</th>
              <th className="px-4 py-2 text-right font-medium">Send</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {batches.map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-2">
                  <input type="hidden" name="batchId" value={b.id} />
                  {b.label}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-500">{b.quantity}</td>
                <td className="px-4 py-2 text-right">
                  <input
                    name="quantity"
                    type="number"
                    min={0}
                    max={b.quantity}
                    step={1}
                    placeholder="—"
                    className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          disabled={pending || !to}
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {pending ? "Sending…" : "Send the stock"}
        </button>
        <span className="text-xs text-slate-500">
          The stock leaves this branch now and arrives when the other branch
          confirms it.
        </span>
      </div>
      {state.status === "error" && <p className="text-sm text-red-700">{state.message}</p>}
    </form>
  );
}
