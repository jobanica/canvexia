"use client";

import { useActionState, useState } from "react";
import { saveBranchAction, type BranchState } from "./actions";
import type { BranchRow } from "@/server/pharmacy/branches";

const IDLE: BranchState = { status: "idle" };
const FIELD = "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm";
const LABEL = "block text-xs font-semibold uppercase tracking-wide text-slate-500";

function BranchForm({ branch, onDone }: { branch?: BranchRow; onDone?: () => void }) {
  const [state, action, pending] = useActionState(saveBranchAction, IDLE);

  return (
    <form action={action} className="rounded-xl border border-slate-200 bg-white p-5">
      {branch && <input type="hidden" name="branchId" value={branch.id} />}
      <p className="text-sm font-semibold">{branch ? `Edit ${branch.name}` : "Open a branch"}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          Name
          <input name="name" required maxLength={120} defaultValue={branch?.name ?? ""} className={FIELD} />
        </label>
        <label className={LABEL}>
          Phone
          <input name="phone" maxLength={40} defaultValue={branch?.phone ?? ""} className={FIELD} />
        </label>
      </div>
      <label className={`${LABEL} mt-3 block`}>
        Address
        <input name="address" maxLength={400} defaultValue={branch?.address ?? ""} className={FIELD} />
      </label>

      {/*
        The main branch cannot be closed. It is where every pre-branch row was
        filed and where a write with no branch falls back to — closing it would
        leave stock belonging nowhere. The server refuses it either way.
      */}
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={branch?.isActive ?? true}
          disabled={branch?.isMain}
        />
        Open for business
        {branch?.isMain && <span className="text-xs text-slate-400">(the main branch stays open)</span>}
      </label>

      <div className="mt-4 flex items-center gap-3">
        <button
          disabled={pending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {pending ? "Saving…" : branch ? "Save changes" : "Open the branch"}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className="text-sm text-slate-500 underline">
            Cancel
          </button>
        )}
        {state.status === "error" && <span className="text-sm text-red-700">{state.message}</span>}
        {state.status === "done" && (
          <span className="text-sm text-emerald-700">{state.message}</span>
        )}
      </div>
    </form>
  );
}

export function BranchList({ rows }: { rows: BranchRow[] }) {
  const [editing, setEditing] = useState<BranchRow | null>(null);

  return (
    <>
      <div className="mb-6">
        {/* Keyed, so switching between branches rebuilds the uncontrolled
            fields instead of showing the previous branch's address. */}
        <BranchForm
          key={editing ? editing.id : `add-${rows.length}`}
          branch={editing ?? undefined}
          onDone={editing ? () => setEditing(null) : undefined}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Branch</th>
              <th className="px-4 py-2 font-medium">Contact</th>
              <th className="px-4 py-2 font-medium">State</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((b) => (
              <tr key={b.id} className={b.isActive ? undefined : "opacity-50"}>
                <td className="px-4 py-2">
                  <span className="font-medium">{b.name}</span>
                  {b.isMain && (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs">main</span>
                  )}
                  {b.address && <p className="text-xs text-slate-400">{b.address}</p>}
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {b.phone ? (
                    <a href={`tel:${b.phone}`} className="underline">
                      {b.phone}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2 text-slate-600">{b.isActive ? "Open" : "Closed"}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => setEditing(b)} className="text-xs text-slate-500 underline">
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
