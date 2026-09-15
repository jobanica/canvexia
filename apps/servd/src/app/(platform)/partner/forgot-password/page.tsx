"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CanvexiaLockup } from "@/components/partner/CanvexiaBrand";
import { requestPartnerPasswordReset, type ResetState } from "@/server/partners/login-action";

export default function PartnerForgotPasswordPage() {
  const [state, action, pending] = useActionState<ResetState, FormData>(
    requestPartnerPasswordReset,
    null,
  );

  return (
    <div className="mx-auto max-w-sm px-6 pt-16">
      <div className="mb-8">
        <CanvexiaLockup size={32} />
      </div>
      <h1 className="font-heading text-2xl font-bold">Reset your password</h1>
      <p className="mt-1 text-sm text-brand-ink/60">
        Enter your partner account email and we&apos;ll send you a link to set a new password.
      </p>

      {state?.ok ? (
        <div className="mt-6 rounded-lg border border-brand-primary/20 bg-brand-primary/5 p-4 text-sm text-brand-ink/75">
          ✓ If an account exists for that email, a reset link is on its way. Check your inbox (and spam).
          <div className="mt-3">
            <Link href="/partner/login" className="font-semibold text-brand-primary">
              ← Back to partner login
            </Link>
          </div>
        </div>
      ) : (
        <form action={action} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-brand-ink/15 px-3 py-2"
            />
          </div>
          {state?.error && <p className="text-sm text-guava">{state.error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg py-2.5 font-semibold btn-brand disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send reset link"}
          </button>
          <div className="text-center">
            <Link href="/partner/login" className="text-sm text-brand-ink/50">
              ← Back to partner login
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
