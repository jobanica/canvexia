"use client";

import { useActionState } from "react";
import { savePrescription, type RxState } from "./actions";

const IDLE: RxState = { status: "idle" };
const FIELD = "mt-1 w-full rounded-xl border border-white/10 px-3 py-2 text-sm";
const LABEL = "block text-xs font-semibold uppercase tracking-wide text-slate-500";

/**
 * Recording what is written on the paper.
 *
 * The prescriber's name is required; the PRC number is not. A pharmacist
 * holding a paper Rx always has the name — the licence number is often not
 * legible, and refusing the record over it means no record at all, which is
 * strictly worse than an incomplete one.
 */
export function PrescriptionForm({
  customers,
  today,
}: {
  customers: { id: string; name: string; phone: string | null }[];
  today: string;
}) {
  const [state, action, pending] = useActionState(savePrescription, IDLE);

  return (
    <form action={action} className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-5">
      <p className="text-sm font-semibold">Record a prescription</p>
      <p className="mt-1 text-sm text-slate-500">
        The paper stays the legal document. This is the index into it — so a
        dispensing can be found later by patient, by prescriber or by PRC number.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          Patient
          <input name="patientName" required maxLength={200} className={FIELD} />
        </label>
        <label className={LABEL}>
          Date of birth
          <input name="patientDob" type="date" className={FIELD} />
        </label>
        <label className={LABEL}>
          Prescriber
          <input name="doctorName" required maxLength={200} className={FIELD} />
        </label>
        <label className={LABEL}>
          PRC licence number
          <input name="doctorPrcNo" maxLength={50} className={FIELD} placeholder="If legible" />
        </label>
        <label className={LABEL}>
          Date on the prescription
          <input name="dateIssued" type="date" required defaultValue={today} className={FIELD} />
        </label>
        <label className={LABEL}>
          Rx number
          <input name="rxNumber" maxLength={100} className={FIELD} placeholder="If it has one" />
        </label>
        <label className={`${LABEL} sm:col-span-2`}>
          Link to a customer
          <select name="customerId" className={FIELD} defaultValue="">
            <option value="">Not linked</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.phone ? ` · ${c.phone}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className={`${LABEL} mt-3 block`}>
        Notes
        <textarea name="notes" rows={2} maxLength={2000} className={FIELD} />
      </label>

      <div className="mt-4 flex items-center gap-3">
        <button
          disabled={pending}
          className="rounded-lg brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {pending ? "Saving…" : "Record it"}
        </button>
        {state.status === "error" && <span className="text-sm text-red-300">{state.message}</span>}
        {state.status === "done" && (
          <span className="text-sm text-emerald-300">{state.message}</span>
        )}
      </div>
    </form>
  );
}
