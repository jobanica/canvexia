"use client";

import { useActionState, useEffect, useRef } from "react";
import { createCategory, type FormState } from "@/server/menu/actions";
import { SubmitButton } from "./SubmitButton";

export function AddCategoryForm() {
  const [state, action] = useActionState<FormState, FormData>(
    createCategory,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the input after a successful add.
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex items-end gap-2">
      <div className="flex-1">
        <label className="block text-xs font-medium text-plum-ink/60">
          New category
        </label>
        <input
          name="name"
          placeholder="e.g. Mains, Drinks, Desserts"
          required
          className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
        />
      </div>
      <SubmitButton pendingLabel="Adding…">Add</SubmitButton>
      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
    </form>
  );
}
