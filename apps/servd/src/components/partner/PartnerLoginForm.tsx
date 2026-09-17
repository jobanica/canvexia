"use client";

import { useActionState } from "react";
import { loginPartner, type LoginState } from "@/server/partners/login-action";
import { PasswordField } from "@/components/auth/PasswordField";

export function PartnerLoginForm() {
  const [state, action] = useActionState<LoginState, FormData>(loginPartner, null);
  const field = "mt-1 w-full rounded-lg border border-brand-ink/15 px-3 py-2 text-sm";

  return (
    <form action={action} className="space-y-4 rounded-tile border border-brand-ink/10 bg-white p-6">
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-brand-ink/50">Email</label>
        <input name="email" type="email" required className={field} />
      </div>
      <PasswordField forgotHref="/partner/forgot-password" />
      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      <button className="w-full rounded-full py-2.5 text-sm font-semibold btn-brand">Log in</button>
    </form>
  );
}
