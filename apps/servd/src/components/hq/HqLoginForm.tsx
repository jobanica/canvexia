"use client";

import { useActionState } from "react";
import { loginHq, type HqLoginState } from "@/server/hq/login-action";
import { PasswordField } from "@/components/auth/PasswordField";

export function HqLoginForm() {
  const [state, action, pending] = useActionState<HqLoginState, FormData>(loginHq, null);
  const field =
    "mt-1 w-full rounded-lg border border-brand-ink/15 bg-white px-3 py-2.5 text-sm";

  return (
    <form action={action} className="space-y-4 rounded-tile border border-brand-ink/10 bg-white p-6 shadow-[0_1px_0_rgba(26,26,30,0.03),0_18px_40px_-30px_rgba(26,26,30,0.45)]">
      <div>
        <label
          htmlFor="hq-email"
          className="block text-xs font-semibold uppercase tracking-wide text-brand-ink/50"
        >
          Email
        </label>
        <input
          id="hq-email"
          name="email"
          type="email"
          required
          autoComplete="username"
          className={field}
        />
      </div>

      {/* HQ had the toggle and no way back in. /hq/forgot-password exists now. */}
      <PasswordField forgotHref="/hq/forgot-password" />

      {state?.error && (
        <p role="alert" className="text-sm text-guava">
          {state.error}
        </p>
      )}

      <button
        disabled={pending}
        className="w-full rounded-full py-2.5 text-sm font-semibold btn-brand disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
