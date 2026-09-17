"use client";

import { useActionState } from "react";
import { saveCustomer, type CustomerState } from "./actions";

const IDLE: CustomerState = { status: "idle" };
const FIELD = "mt-1 w-full rounded-xl border border-white/10 px-3 py-2 text-sm";
const LABEL = "block text-xs font-semibold uppercase tracking-wide text-slate-500";

export interface CustomerDefaults {
  id?: string;
  name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

/**
 * Add a customer, or edit one.
 *
 * Only the name is required. A customer who gives a phone number and nothing
 * else is a customer the pharmacy can still ring about a repeat prescription,
 * and a form that demands an address gets a fake one typed into it.
 */
export function CustomerForm({
  defaults,
  onDone,
}: {
  defaults?: CustomerDefaults;
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState(saveCustomer, IDLE);
  const editing = Boolean(defaults?.id);

  return (
    <form action={action} className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-5">
      {defaults?.id && <input type="hidden" name="customerId" value={defaults.id} />}
      <p className="text-sm font-semibold">
        {editing ? `Edit ${defaults?.name}` : "Add a customer"}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          Name
          <input name="name" required maxLength={200} defaultValue={defaults?.name ?? ""} className={FIELD} />
        </label>
        <label className={LABEL}>
          Mobile
          <input name="phone" maxLength={40} defaultValue={defaults?.phone ?? ""} className={FIELD} />
        </label>
        <label className={LABEL}>
          Email
          <input name="email" maxLength={200} defaultValue={defaults?.email ?? ""} className={FIELD} />
        </label>
        <label className={LABEL}>
          Address
          <input name="address" maxLength={400} defaultValue={defaults?.address ?? ""} className={FIELD} />
        </label>
      </div>

      <label className={`${LABEL} mt-3 block`}>
        Notes
        <textarea
          name="notes"
          rows={2}
          maxLength={2000}
          defaultValue={defaults?.notes ?? ""}
          className={FIELD}
          placeholder="Maintenance meds, allergies, who collects for them…"
        />
      </label>

      <div className="mt-4 flex items-center gap-3">
        <button
          disabled={pending}
          className="rounded-lg brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {pending ? "Saving…" : editing ? "Save changes" : "Add customer"}
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
