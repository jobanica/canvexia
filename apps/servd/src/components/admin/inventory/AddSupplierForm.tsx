"use client";

import { useActionState, useEffect, useRef } from "react";
import { createSupplier, type FormState } from "@/server/inventory/actions";
import { SubmitButton } from "../SubmitButton";

export function AddSupplierForm() {
  const [state, action] = useActionState<FormState, FormData>(createSupplier, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="flex flex-wrap items-end gap-2">
      <input name="name" placeholder="Supplier name" required className="flex-1 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
      <input name="contact" placeholder="Contact (phone/email)" className="flex-1 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
      <SubmitButton>Add</SubmitButton>
      {state?.error && <span className="text-xs text-guava">{state.error}</span>}
    </form>
  );
}
