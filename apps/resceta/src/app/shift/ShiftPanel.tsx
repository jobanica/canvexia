"use client";

import { useActionState } from "react";
import { startShift, endShift, type ShiftState } from "./actions";
import { peso, manilaDateTime } from "@/lib/money";

const IDLE: ShiftState = { status: "idle" };
const FIELD = "mt-1 w-full rounded-xl border border-white/10 px-3 py-2 text-sm";
const LABEL = "block text-xs font-semibold uppercase tracking-wide text-slate-500";

export function OpenShiftForm() {
  const [state, action, pending] = useActionState(startShift, IDLE);

  return (
    <form action={action} className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-5">
      <p className="text-sm font-semibold">Open the till</p>
      <p className="mt-1 text-sm text-slate-500">
        Count the float before you start. Every sale rung up from now is attached
        to this shift, and the Z-reading at the end covers exactly those.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          Float in the drawer ₱
          <input name="openingCash" type="number" min={0} step="0.01" required className={FIELD} />
        </label>
        <label className={LABEL}>
          Notes
          <input name="notes" maxLength={500} className={FIELD} />
        </label>
      </div>
      <button
        disabled={pending}
        className="mt-4 rounded-lg brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {pending ? "Opening…" : "Open the shift"}
      </button>
      {state.status === "error" && <p className="mt-2 text-sm text-red-300">{state.message}</p>}
    </form>
  );
}

/**
 * Closing the till.
 *
 * THE EXPECTED FIGURE IS SHOWN BEFORE THE BOX, and that is a deliberate choice
 * with a real trade-off: it makes it easy for somebody to type the expected
 * number instead of counting. The alternative — hiding it — makes an honest
 * cashier unable to tell a counting mistake from a genuine shortage while the
 * drawer is still in front of them, and a shortage found the next morning is a
 * shortage nobody can explain. The over/short is recorded either way, which is
 * what the record is for.
 */
export function CloseShiftForm({
  shiftId,
  openedAt,
  openingCashCentavos,
  cashSoFarCentavos,
}: {
  shiftId: string;
  openedAt: Date;
  openingCashCentavos: number;
  cashSoFarCentavos: number;
}) {
  const [state, action, pending] = useActionState(endShift, IDLE);
  const expected = openingCashCentavos + cashSoFarCentavos;

  return (
    <form action={action} className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-5">
      <input type="hidden" name="shiftId" value={shiftId} />
      <p className="text-sm font-semibold">Close the till</p>
      <p className="mt-1 text-sm text-slate-500">
        Open since {manilaDateTime(openedAt)}. Float {peso(openingCashCentavos)} plus{" "}
        {peso(cashSoFarCentavos)} taken in cash —{" "}
        <span className="font-semibold text-white">{peso(expected)}</span> should be in
        the drawer.
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Card and e-wallet sales are not in the drawer, which is why this figure is
        the cash line and not the day&rsquo;s total.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          Counted in the drawer ₱
          <input name="countedCash" type="number" min={0} step="0.01" required className={FIELD} />
        </label>
        <label className={LABEL}>
          Notes
          <input name="notes" maxLength={500} className={FIELD} />
        </label>
      </div>

      <button
        disabled={pending}
        className="mt-4 rounded-lg brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {pending ? "Closing…" : "Close the shift and cut the Z-reading"}
      </button>
      {state.status === "error" && <p className="mt-2 text-sm text-red-300">{state.message}</p>}
      {state.status === "done" && (
        <p className="mt-2 text-sm font-medium text-emerald-300">{state.message}</p>
      )}
    </form>
  );
}
