"use client";

import { useFormStatus } from "react-dom";

/** A submit button that disables + shows a label while its form is pending. */
export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  className = "",
  formAction,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  /** Lets one form carry two submits (e.g. "send test" beside "send"). */
  formAction?: (formData: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      formAction={formAction}
      disabled={pending}
      className={`rounded-lg px-4 py-2 text-sm font-semibold btn-brand disabled:opacity-60 ${className}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
