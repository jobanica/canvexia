"use client";

import { useActionState } from "react";
import { startCount, type StocktakeState } from "./actions";

const IDLE: StocktakeState = { status: "idle" };

export function StartCount() {
  const [state, action, pending] = useActionState(startCount, IDLE);

  return (
    <form action={action} className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm font-semibold">Start a count</p>
      <p className="mt-1 text-sm text-slate-500">
        Opens a sheet over the whole catalogue — including products the system
        thinks are at zero, which is exactly where a surprise lives. The system
        quantities are snapshotted now, so sales rung up while you count do not
        turn into a discrepancy.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block flex-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Notes
          <input
            name="notes"
            maxLength={500}
            placeholder="Monthly count, October"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <button
          disabled={pending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {pending ? "Opening…" : "Open a count sheet"}
        </button>
      </div>
      {state.status === "error" && <p className="mt-2 text-sm text-red-700">{state.message}</p>}
    </form>
  );
}
