"use client";

import { useActionState } from "react";
import { activatePharmacyAction, type ActivateState } from "./actions";

export function ActivateButton({ pharmacyId }: { pharmacyId: string }) {
  const [state, action, pending] = useActionState<ActivateState, FormData>(activatePharmacyAction, { status: "idle" });
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("Activate this pharmacy? It will be able to dispense.")) e.preventDefault();
      }}
      className="text-right"
    >
      <input type="hidden" name="pharmacyId" value={pharmacyId} />
      <button disabled={pending} className="rounded-full px-4 py-2 text-sm font-semibold btn-brand disabled:opacity-60">
        {pending ? "Activating…" : "Activate"}
      </button>
      {state.status !== "idle" && (
        <p className={`mt-1 text-xs ${state.status === "error" ? "text-guava" : "text-emerald-700"}`}>{state.message}</p>
      )}
    </form>
  );
}
