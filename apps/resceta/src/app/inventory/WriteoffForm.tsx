"use client";

import { useActionState, useState } from "react";
import { recordWriteoff, type WriteoffState } from "./actions";
import { REASON_LABEL, WRITEOFF_REASONS } from "@/lib/pharmacy/writeoff-input";
import { peso, manilaExpiry } from "@/lib/money";

const IDLE: WriteoffState = { status: "idle" };
const FIELD = "mt-1 w-full rounded-xl border border-white/10 px-3 py-2 text-sm";
const LABEL = "block text-xs font-semibold uppercase tracking-wide text-slate-500";

export interface BatchOption {
  id: string;
  label: string;
  quantity: number;
  expired: boolean;
}

/**
 * Taking a quantity off a batch, with a reason.
 *
 * A BATCH, NOT A PRODUCT. Stock lives in batches and a recall names a lot
 * number — writing off "20 paracetamol" without saying which lot means the
 * remaining stock's expiry profile is now wrong, which is the one thing this
 * system exists to keep right.
 */
export function WriteoffForm({ batches }: { batches: BatchOption[] }) {
  const [state, action, pending] = useActionState(recordWriteoff, IDLE);
  const [reason, setReason] = useState<string>("expired");

  if (batches.length === 0) {
    return (
      <p className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 text-sm text-slate-300">
        Nothing on the shelf to write off.
      </p>
    );
  }

  return (
    <form action={action} className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-5">
      <p className="text-sm font-semibold">Take stock off the shelf</p>
      <p className="mt-1 text-sm text-slate-500">
        Expired, damaged, donated, lost or recalled. The batch comes down, the
        ledger records it, and the value is kept so you can report on it.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className={`${LABEL} sm:col-span-2`}>
          Batch
          <select name="batchId" required className={FIELD} defaultValue="">
            <option value="">Pick a batch…</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </label>

        <label className={LABEL}>
          Quantity
          <input name="quantity" type="number" min={1} step={1} required className={FIELD} />
        </label>

        <label className={LABEL}>
          Reason
          <select
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={FIELD}
          >
            {WRITEOFF_REASONS.map((r) => (
              <option key={r} value={r}>
                {REASON_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/*
        Only for a donation, and required there. A donation with no recipient
        is indistinguishable from stock that walked — which is exactly what the
        word "donated" would then be hiding. The server enforces it too.
      */}
      {reason === "donated" && (
        <label className={`${LABEL} mt-3 block`}>
          Given to
          <input
            name="recipient"
            required
            maxLength={200}
            placeholder="Barangay health centre, relief drive, clinic…"
            className={FIELD}
          />
        </label>
      )}

      <label className={`${LABEL} mt-3 block`}>
        Notes
        <input name="notes" maxLength={1000} className={FIELD} />
      </label>

      <div className="mt-4 flex items-center gap-3">
        <button
          disabled={pending}
          className="rounded-lg brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {pending ? "Recording…" : "Record it"}
        </button>
        {state.status === "error" && <span className="text-sm text-red-300">{state.message}</span>}
        {state.status === "done" && (
          <span className="text-sm text-emerald-300">{state.message}</span>
        )}
      </div>
    </form>
  );
}

/** Build the option label on the server side of the boundary. */
export function batchLabel(b: {
  productName: string;
  lotNumber: string | null;
  expiryDate: Date | null;
  quantity: number;
  costCentavos: number;
  unit: string;
}): string {
  const bits = [b.productName];
  if (b.lotNumber) bits.push(`lot ${b.lotNumber}`);
  bits.push(b.expiryDate ? `exp ${manilaExpiry(b.expiryDate)}` : "no expiry");
  bits.push(`${b.quantity} ${b.unit}`);
  bits.push(`${peso(b.costCentavos)} each`);
  return bits.join(" · ");
}
