"use client";

import { useActionState } from "react";
import { adjustCustomerPoints, type CustomerState } from "../actions";

const IDLE: CustomerState = { status: "idle" };

/**
 * A manual points correction.
 *
 * The note is required and the server enforces it too. An unexplained balance
 * change is exactly what the ledger exists to prevent, and "the system just
 * did it" is the answer nobody can give a customer disputing their points.
 */
export function PointsPanel({ customerId, balance }: { customerId: string; balance: number }) {
  const [state, action, pending] = useActionState(adjustCustomerPoints, IDLE);

  return (
    <form action={action} className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-5">
      <input type="hidden" name="customerId" value={customerId} />
      <p className="text-sm font-semibold">Adjust points</p>
      <p className="mt-1 text-sm text-slate-500">
        Balance is <span className="font-semibold text-white">{balance}</span>. Use a
        negative number to take points away.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Points
          <input
            name="points"
            type="number"
            step="1"
            required
            className="mt-1 w-28 rounded-xl border border-white/10 px-3 py-2 text-sm"
          />
        </label>
        <label className="block flex-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Why
          <input
            name="note"
            required
            maxLength={500}
            placeholder="Goodwill after a stock-out"
            className="mt-1 w-full rounded-xl border border-white/10 px-3 py-2 text-sm"
          />
        </label>
        <button
          disabled={pending}
          className="rounded-lg brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {pending ? "Saving…" : "Apply"}
        </button>
      </div>

      {state.status === "error" && <p className="mt-2 text-sm text-red-300">{state.message}</p>}
      {state.status === "done" && <p className="mt-2 text-sm text-emerald-300">{state.message}</p>}
    </form>
  );
}
