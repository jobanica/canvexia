"use client";

import { useActionState } from "react";
import { updateEmail, updatePassword, updatePhone, updateAddress, type AccountState } from "@/server/account/actions";
import { SubmitButton } from "./SubmitButton";

function Notice({ state }: { state: AccountState }) {
  if (!state) return null;
  if (state.error) return <p className="text-sm text-guava">{state.error}</p>;
  if (state.ok) return <p className="text-sm text-mango">{state.message ?? "Saved."}</p>;
  return null;
}

export function AccountForms({ initial }: { initial: { email: string; phone: string; address: string } }) {
  const [emailState, emailAction] = useActionState<AccountState, FormData>(updateEmail, null);
  const [pwState, pwAction] = useActionState<AccountState, FormData>(updatePassword, null);
  const [phoneState, phoneAction] = useActionState<AccountState, FormData>(updatePhone, null);
  const [addressState, addressAction] = useActionState<AccountState, FormData>(updateAddress, null);

  const input = "mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm";
  const card = "space-y-3 rounded-tile border border-plum-ink/10 bg-white p-5";

  return (
    <div className="max-w-xl space-y-5">
      {/* Email */}
      <form action={emailAction} className={card}>
        <h2 className="font-heading text-lg font-bold">Login email</h2>
        <label className="block text-sm">
          New email
          <input name="email" type="email" defaultValue={initial.email} required className={input} />
        </label>
        <p className="text-xs text-plum-ink/50">This becomes your login email right away — use it next time you sign in.</p>
        <Notice state={emailState} />
        <SubmitButton>Update email</SubmitButton>
      </form>

      {/* Password */}
      <form action={pwAction} className={card}>
        <h2 className="font-heading text-lg font-bold">Password</h2>
        <label className="block text-sm">
          New password
          <input name="password" type="password" autoComplete="new-password" required className={input} />
        </label>
        <label className="block text-sm">
          Confirm password
          <input name="confirm" type="password" autoComplete="new-password" required className={input} />
        </label>
        <Notice state={pwState} />
        <SubmitButton>Update password</SubmitButton>
      </form>

      {/* Phone */}
      <form action={phoneAction} className={card}>
        <h2 className="font-heading text-lg font-bold">Contact phone</h2>
        <label className="block text-sm">
          Phone number
          <input name="phone" inputMode="tel" defaultValue={initial.phone} placeholder="(082) 123-4567" className={input} />
        </label>
        <p className="text-xs text-plum-ink/50">Shown on your receipts and your online ordering website.</p>
        <Notice state={phoneState} />
        <SubmitButton>Update phone</SubmitButton>
      </form>

      {/* Business address */}
      <form action={addressAction} className={card}>
        <h2 className="font-heading text-lg font-bold">Business address</h2>
        <label className="block text-sm">
          Address
          <textarea name="address" rows={2} defaultValue={initial.address} placeholder="123 Rizal St, Poblacion, Davao City" className={input} />
        </label>
        <p className="text-xs text-plum-ink/50">Shown on your receipts and your online ordering website.</p>
        <Notice state={addressState} />
        <SubmitButton>Update address</SubmitButton>
      </form>
    </div>
  );
}
