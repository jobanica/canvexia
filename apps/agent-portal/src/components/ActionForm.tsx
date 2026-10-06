"use client";

import { useActionState } from "react";
import { IDLE, type FormState } from "@/lib/form-state";

/**
 * A form bound to a server action, with the error/success line every form
 * here needs. The action is the security boundary — it re-checks who is
 * signed in — so this component is only presentation.
 */
export function ActionForm({
  action,
  submitLabel,
  pendingLabel,
  children,
  className,
  danger,
  confirm,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  submitLabel: string;
  pendingLabel?: string;
  children?: React.ReactNode;
  className?: string;
  danger?: boolean;
  /** Ask before submitting — for actions that are hard to undo. */
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className={className ?? "space-y-3"}
    >
      {children}
      {state.status === "error" && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-900">
          {state.message}
        </p>
      )}
      {state.status === "done" && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-900">
          <p>{state.message}</p>
          {state.secret && (
            <p className="mt-2">
              <code className="block break-all rounded bg-white p-2 font-mono text-xs text-slate-900 select-all">
                {state.secret}
              </code>
              <span className="mt-1 block text-xs">
                Copy it now. It is stored encrypted and will not be shown again.
              </span>
            </p>
          )}
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className={
          (danger
            ? "bg-red-700 hover:bg-red-800"
            : "bg-slate-900 hover:bg-slate-800") +
          " rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        }
      >
        {pending ? (pendingLabel ?? "Saving…") : submitLabel}
      </button>
    </form>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base sm:text-sm";
