"use client";

import { useActionState, useState } from "react";
import { saveSupplier, removeSupplier, type SupplierState } from "./actions";
import type { SupplierRow } from "@/server/pharmacy/suppliers";

const IDLE: SupplierState = { status: "idle" };
const FIELD = "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm";
const LABEL = "block text-xs font-semibold uppercase tracking-wide text-slate-500";

/**
 * Add a supplier, or edit one.
 *
 * ONE FORM FOR BOTH, keyed by the row being edited. `key` on the element in the
 * parent is what makes React rebuild the inputs when a different supplier is
 * picked — without it the fields keep the previous supplier's values, which is
 * how somebody overwrites the wrong distributor's phone number.
 */
export function SupplierForm({ editing, onDone }: { editing: SupplierRow | null; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveSupplier, IDLE);

  // A finished save clears the form by remounting it from the parent; this only
  // reports what happened.
  return (
    <form action={action} className="rounded-xl border border-slate-200 bg-white p-5">
      {editing && <input type="hidden" name="supplierId" value={editing.id} />}
      <p className="text-sm font-semibold">
        {editing ? `Edit ${editing.name}` : "Add a supplier"}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          Name
          <input name="name" required maxLength={200} defaultValue={editing?.name ?? ""} className={FIELD} />
        </label>
        <label className={LABEL}>
          Contact person
          <input
            name="contactPerson"
            maxLength={200}
            defaultValue={editing?.contactPerson ?? ""}
            className={FIELD}
          />
        </label>
        <label className={LABEL}>
          Phone
          <input name="phone" maxLength={40} defaultValue={editing?.phone ?? ""} className={FIELD} />
        </label>
        <label className={LABEL}>
          Email
          <input name="email" maxLength={200} defaultValue={editing?.email ?? ""} className={FIELD} />
        </label>
      </div>

      <label className={`${LABEL} mt-3 block`}>
        Address
        <input name="address" maxLength={400} defaultValue={editing?.address ?? ""} className={FIELD} />
      </label>

      <label className={`${LABEL} mt-3 block`}>
        Notes
        <textarea
          name="notes"
          rows={2}
          maxLength={2000}
          defaultValue={editing?.notes ?? ""}
          className={FIELD}
          placeholder="Delivery days, minimum order, terms…"
        />
      </label>

      <div className="mt-4 flex items-center gap-3">
        <button
          disabled={pending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {pending ? "Saving…" : editing ? "Save changes" : "Add supplier"}
        </button>
        {editing && (
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

/**
 * Removing one.
 *
 * Kept separate from the edit form because it is a different verb with a
 * different outcome, and a Delete button inside a form whose submit means Save
 * is how somebody deletes a supplier they meant to rename.
 */
export function SupplierDelete({ supplier }: { supplier: SupplierRow }) {
  const [state, action, pending] = useActionState(removeSupplier, IDLE);
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <>
        <button onClick={() => setArmed(true)} className="text-xs text-slate-400 hover:text-red-700">
          Remove
        </button>
        {state.status === "error" && <p className="mt-1 text-xs text-red-700">{state.message}</p>}
      </>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="supplierId" value={supplier.id} />
      <button disabled={pending} className="text-xs font-semibold text-red-700 disabled:opacity-40">
        {pending ? "Removing…" : "Confirm"}
      </button>
      <button type="button" onClick={() => setArmed(false)} className="text-xs text-slate-400">
        Cancel
      </button>
    </form>
  );
}
