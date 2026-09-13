"use client";

import { useActionState, useEffect, useRef } from "react";
import { createEmployee, type FormState } from "@/server/hr/actions";
import { SubmitButton } from "../SubmitButton";

export function AddEmployeeForm() {
  const [state, action] = useActionState<FormState, FormData>(createEmployee, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="rounded-tile border border-plum-ink/10 bg-white p-4">
      <h3 className="font-heading font-bold">Add employee</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input name="fullName" placeholder="Full name" required className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
        <input name="title" placeholder="Title (e.g. Line cook)" className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
        <select name="employmentType" className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm">
          <option value="full_time">Full-time</option>
          <option value="part_time">Part-time</option>
          <option value="contract">Contract</option>
        </select>
        <select name="payType" className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm">
          <option value="hourly">Hourly</option>
          <option value="daily">Daily</option>
          <option value="monthly">Monthly</option>
        </select>
        <input name="payPesos" type="number" step="0.01" min="0" placeholder="Pay rate (₱)" className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
        <input name="clockPin" placeholder="Clock PIN (optional)" className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
        <input name="phone" placeholder="Phone" className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
        <input name="emergency" placeholder="Emergency contact" className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
      </div>
      {state?.error && <p className="mt-2 text-sm text-guava">{state.error}</p>}
      <div className="mt-3"><SubmitButton>Add employee</SubmitButton></div>
    </form>
  );
}
