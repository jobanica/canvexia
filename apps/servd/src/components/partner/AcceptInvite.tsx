"use client";

import { PasswordField } from "@/components/auth/PasswordField";

import { useActionState } from "react";
import { acceptInviteAction, type AcceptState } from "@/server/partners/accept-invite-action";

/**
 * Set a name and a password, and the seat is live.
 *
 * NOTHING ELSE IS ASKED. The role, the partner and the address are already on
 * the invitation; every extra field here is a field between somebody and their
 * first day.
 */
export function AcceptInvite({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState<AcceptState, FormData>(
    acceptInviteAction,
    null,
  );
  const field = "mt-1 w-full rounded-lg border border-brand-ink/15 px-3 py-2 text-sm";

  return (
    <form action={action} className="space-y-4 rounded-tile border border-brand-ink/10 bg-white p-6">
      <input type="hidden" name="token" value={token} />
      {/* Readonly rather than absent: people want to see which address they are
          being signed up under, and it is not theirs to change here. */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-brand-ink/50">
          Email
        </label>
        <input value={email} readOnly className={`${field} bg-brand-surface text-brand-ink/60`} />
      </div>
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-brand-ink/50">
          Your name
        </label>
        <input name="name" required autoComplete="name" className={field} />
      </div>
      {/*
        No "forgot password" here — you are choosing one. The toggle is the
        whole point on this screen: ten characters, typed twice, blind.
      */}
      <PasswordField
        label="Password"
        minLength={10}
        autoComplete="new-password"
        hint="At least 10 characters."
      />
      <PasswordField
        name="confirm"
        label="Confirm password"
        minLength={10}
        autoComplete="new-password"
      />
      {state?.error && (
        <p role="alert" className="text-sm text-guava">
          {state.error}
        </p>
      )}
      <button
        disabled={pending}
        className="w-full rounded-full py-2.5 text-sm font-semibold btn-brand disabled:opacity-60"
      >
        {pending ? "Setting up…" : "Create my account"}
      </button>
    </form>
  );
}
