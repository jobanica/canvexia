"use client";

import { useActionState, useState } from "react";
import { loginHq, type HqLoginState } from "@/server/hq/login-action";

export function HqLoginForm() {
  const [state, action, pending] = useActionState<HqLoginState, FormData>(loginHq, null);
  const [show, setShow] = useState(false);
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

      <div>
        <label
          htmlFor="hq-password"
          className="block text-xs font-semibold uppercase tracking-wide text-brand-ink/50"
        >
          Password
        </label>
        <div className="relative">
          <input
            id="hq-password"
            name="password"
            type={show ? "text" : "password"}
            required
            autoComplete="current-password"
            className={`${field} pr-16`}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-pressed={show}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-xs font-semibold text-brand-ink/45 hover:text-brand-ink"
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </div>

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
