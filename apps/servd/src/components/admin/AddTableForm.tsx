"use client";

import { useActionState, useEffect, useRef } from "react";
import { createTable, type FormState } from "@/server/tables/actions";
import { SubmitButton } from "./SubmitButton";

export function AddTableForm() {
  const [state, action] = useActionState<FormState, FormData>(
    createTable,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex items-end gap-2">
      <div className="flex-1">
        <label className="block text-xs font-medium text-plum-ink/60">
          New table
        </label>
        <input
          name="tableNumber"
          placeholder='e.g. "1", "Patio-3", "Bar"'
          required
          className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
        />
      </div>
      <SubmitButton pendingLabel="Adding…">Add table</SubmitButton>
      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
    </form>
  );
}
