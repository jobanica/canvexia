"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginPartner, type LoginState } from "@/server/partners/login-action";

export function PartnerLoginForm() {
  const [state, action] = useActionState<LoginState, FormData>(loginPartner, null);
  const field = "mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm";

  return (
    <form action={action} className="space-y-4 rounded-tile border border-plum-ink/10 bg-white p-6">
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-plum-ink/50">Email</label>
        <input name="email" type="email" required className={field} />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className="block text-xs font-semibold uppercase tracking-wide text-plum-ink/50">Password</label>
          <Link href="/partner/forgot-password" className="text-xs font-semibold text-brand-primary">
            Forgot password?
          </Link>
        </div>
        <input name="password" type="password" required className={field} />
      </div>
      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      <button className="w-full rounded-full py-2.5 text-sm font-semibold btn-brand">Log in</button>
    </form>
  );
}
