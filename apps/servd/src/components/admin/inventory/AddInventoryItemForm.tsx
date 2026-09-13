"use client";

import { useActionState, useEffect, useRef } from "react";
import { createInventoryItem, type FormState } from "@/server/inventory/actions";
import { SubmitButton } from "../SubmitButton";

export function AddInventoryItemForm({
  suppliers,
}: {
  suppliers: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<FormState, FormData>(createInventoryItem, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action}>
      <div className="grid gap-2 sm:grid-cols-3">
        <input name="name" placeholder="Name (e.g. Beef patty)" required className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
        <input name="unit" placeholder="Unit (kg, pc, ml)" required className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
        <select name="supplierId" className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm">
          <option value="">No supplier</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <input name="stockQty" type="number" step="0.01" min="0" placeholder="Opening stock" className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
        <input name="costPesos" type="number" step="0.01" min="0" placeholder="Cost/unit (₱)" className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
        <input name="reorderLevel" type="number" step="0.01" min="0" placeholder="Reorder level" className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
      </div>
      {state?.error && <p className="mt-2 text-sm text-guava">{state.error}</p>}
      <div className="mt-3"><SubmitButton>Add</SubmitButton></div>
    </form>
  );
}
