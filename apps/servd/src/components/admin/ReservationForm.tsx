"use client";

import { useActionState, useState } from "react";
import { createReservation, type FormState } from "@/server/reservations/reservations";
import { SubmitButton } from "./SubmitButton";

export function ReservationForm({
  tables = [],
}: {
  tables?: { id: string; tableNumber: string }[];
}) {
  const [state, action] = useActionState<FormState, FormData>(createReservation, null);
  const [kind, setKind] = useState<"reservation" | "waitlist">("reservation");

  return (
    <form action={action} className="space-y-4 rounded-tile border border-plum-ink/10 bg-white p-5">
      <div className="flex gap-2">
        {(["reservation", "waitlist"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`flex-1 rounded-full py-2 text-sm font-semibold ${
              kind === k ? "bg-brand-primary text-white" : "bg-white text-plum-ink/70 ring-1 ring-plum-ink/10"
            }`}
          >
            {k === "reservation" ? "📅 Reservation" : "⏳ Waitlist"}
          </button>
        ))}
      </div>
      <input type="hidden" name="kind" value={kind} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">Name</span>
          <input name="customerName" required className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Phone (optional)</span>
          <input name="customerPhone" className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Party size</span>
          <input name="partySize" type="number" min="1" defaultValue={2} className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2" />
        </label>
        {kind === "reservation" && (
          <label className="block text-sm">
            <span className="font-medium">Date &amp; time</span>
            <input name="when" type="datetime-local" className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2" />
          </label>
        )}
        <label className="block text-sm">
          <span className="font-medium">Table (optional)</span>
          <select
            name="tableId"
            defaultValue=""
            className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
          >
            <option value="">No table yet</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                Table {t.tableNumber}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-plum-ink/45">
            Picking a table marks it reserved on the floor plan.
          </span>
        </label>
      </div>

      <label className="block text-sm">
        <span className="font-medium">Note (optional)</span>
        <input name="note" placeholder="e.g. window seat, birthday" className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2" />
      </label>

      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      {state?.ok && <p className="text-sm text-mango">Saved.</p>}
      <SubmitButton>{kind === "reservation" ? "Add reservation" : "Add to waitlist"}</SubmitButton>
    </form>
  );
}
