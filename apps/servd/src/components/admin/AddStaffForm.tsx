"use client";

import { useActionState, useEffect, useRef } from "react";
import { createStaff, type FormState } from "@/server/staff/actions";
import { SubmitButton } from "./SubmitButton";

export function AddStaffForm() {
  const [state, action] = useActionState<FormState, FormData>(createStaff, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="rounded-tile border border-plum-ink/10 bg-white p-4">
      <h3 className="font-heading font-bold">Add staff login</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input name="displayName" placeholder="Name (optional)" className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
        <select name="role" className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm">
          <option value="cashier">Cashier — POS only</option>
          <option value="kitchen">Kitchen — kitchen display only</option>
          <option value="merchant">Merchant — incoming online orders only</option>
          <option value="manager">Manager — menu, service, marketing &amp; back office (no settings)</option>
          <option value="admin">Admin — full access</option>
        </select>
        <input name="email" type="email" placeholder="Email" required className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
        <input name="password" type="text" placeholder="Temporary password (min 8)" required minLength={8} className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
      </div>
      {state?.error && <p className="mt-2 text-sm text-guava">{state.error}</p>}
      {state?.ok && <p className="mt-2 text-sm text-mango">Login created — share the email + password with them.</p>}
      <div className="mt-3"><SubmitButton>Create login</SubmitButton></div>
    </form>
  );
}
