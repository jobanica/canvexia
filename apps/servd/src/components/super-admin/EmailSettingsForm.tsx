"use client";

import { useActionState } from "react";
import { saveEmailSettings, type EmailSettingsState } from "@/server/email/actions";
import { SubmitButton } from "@/components/admin/SubmitButton";

/**
 * The platform's sending identity. The API key is write-only — it's never sent
 * back to the browser, and leaving the field blank keeps whatever is saved.
 */
export function EmailSettingsForm({
  initial,
}: {
  initial: { configured: boolean; fromName: string; fromEmail: string; replyTo: string };
}) {
  const [state, action] = useActionState<EmailSettingsState, FormData>(saveEmailSettings, null);

  return (
    <form action={action} className="rounded-tile border border-plum-ink/10 bg-white p-4">
      <h2 className="font-heading text-lg font-bold">Sending setup</h2>
      <p className="text-sm text-plum-ink/50">
        Resend API key and the address your campaigns come from. Verify your domain in Resend
        first, or your mail lands in spam.
      </p>

      <label className="mt-4 block text-xs font-semibold text-plum-ink/60">
        Resend API key {initial.configured && <span className="text-green-700">· saved</span>}
      </label>
      <input
        name="apiKey"
        type="password"
        autoComplete="off"
        placeholder={initial.configured ? "•••••••• (leave blank to keep)" : "re_..."}
        className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 font-mono text-sm"
      />

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-plum-ink/60">From name</label>
          <input
            name="fromName"
            defaultValue={initial.fromName}
            placeholder="Servd"
            className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-plum-ink/60">From address</label>
          <input
            name="fromEmail"
            type="email"
            defaultValue={initial.fromEmail}
            placeholder="hello@servdph.com"
            className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <label className="mt-3 block text-xs font-semibold text-plum-ink/60">
        Reply-to <span className="font-normal text-plum-ink/40">(optional)</span>
      </label>
      <input
        name="replyTo"
        type="email"
        defaultValue={initial.replyTo}
        placeholder="you@servdph.com"
        className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
      />

      <div className="mt-4 flex items-center gap-3">
        <SubmitButton>Save</SubmitButton>
        {state?.ok && <span className="text-sm text-green-700">Saved.</span>}
        {state?.error && <span className="text-sm text-guava">{state.error}</span>}
      </div>
    </form>
  );
}
