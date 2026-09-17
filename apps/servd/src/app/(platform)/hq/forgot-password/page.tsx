"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CanvexiaLockup } from "@/components/partner/CanvexiaBrand";
import { requestHqPasswordReset, type HqResetState } from "@/server/hq/login-action";

/**
 * The HQ console's way back in.
 *
 * It did not have one. The sign-in form offered a Show toggle and nothing else,
 * so an ops admin who forgot their password had to find somebody with database
 * access. Same page as the partner portal's, in CANVEXIA's own colours, because
 * it is the same company's console.
 */
export default function HqForgotPasswordPage() {
  const [state, action, pending] = useActionState<HqResetState, FormData>(
    requestHqPasswordReset,
    null,
  );

  return (
    <div className="brand-canvexia min-h-screen bg-brand-surface text-brand-ink">
      <div className="mx-auto max-w-sm px-6 py-16">
        <CanvexiaLockup size={30} />

        <h1 className="mt-8 font-heading text-2xl font-bold">Reset your password</h1>
        <p className="mt-1 text-sm text-brand-ink/55">
          Enter the email on your HQ seat and we&apos;ll send you a link to set a new one.
        </p>

        {state?.ok ? (
          <div className="mt-6 rounded-tile border border-brand-primary/20 bg-brand-primary/5 p-4 text-sm text-brand-ink/75">
            ✓ If an HQ account exists for that email, a reset link is on its way. Check your inbox
            (and spam).
            <div className="mt-3">
              <Link href="/hq/login" className="font-semibold text-brand-primary">
                ← Back to the HQ console
              </Link>
            </div>
          </div>
        ) : (
          <form action={action} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="hq-reset-email"
                className="block text-xs font-semibold uppercase tracking-wide text-brand-ink/50"
              >
                Email
              </label>
              <input
                id="hq-reset-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="mt-1 w-full rounded-lg border border-brand-ink/15 bg-white px-3 py-2.5 text-sm"
              />
            </div>
            {state?.error && (
              <p role="alert" className="text-sm text-guava">
                {state.error}
              </p>
            )}
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-full py-2.5 text-sm font-semibold btn-brand disabled:opacity-60"
            >
              {pending ? "Sending…" : "Send reset link"}
            </button>
            <div className="text-center">
              <Link href="/hq/login" className="text-sm text-brand-ink/50">
                ← Back to the HQ console
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
