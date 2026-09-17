"use client";

import { useId, useState } from "react";

/**
 * A password box you can see into.
 *
 * Resceta's sign-in had neither this nor a way to recover a forgotten password
 * — and with no self-serve login handover either, an owner who forgot theirs
 * had exactly one recovery path: the `staff:create` CLI script, run by whoever
 * has the service-role key.
 *
 * It defaults to hidden, is never remembered between loads, and labels the
 * button by what it DOES rather than repeating its own text — a control reading
 * "Show" with a label of "Show" is announced twice and explains nothing.
 *
 * `pr-16` is load-bearing: without it the toggle sits on top of the last
 * characters of a long password, which is exactly what somebody turned it on to
 * read.
 */
export function PasswordField({
  label,
  value,
  onChange,
  autoComplete = "current-password",
  autoFocus,
  minLength,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: "current-password" | "new-password";
  autoFocus?: boolean;
  minLength?: number;
  hint?: string;
}) {
  const [show, setShow] = useState(false);
  const id = useId();

  return (
    <div className="text-sm">
      <label htmlFor={id} className="mb-1 block font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          className="w-full rounded-md border border-slate-300 px-3 py-2 pr-16"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-pressed={show}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-xs font-semibold text-slate-500 hover:text-slate-900"
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
