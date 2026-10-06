"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ReferralCodeField } from "@servd/core/agent-kit/react";
import { signUpAction, type SignupState } from "./actions";

const IDLE: SignupState = { status: "idle" };
const input = "w-full rounded-md border border-slate-300 px-3 py-2";

export function SignupForm({ initialCode }: { initialCode: string }) {
  const [state, action, pending] = useActionState(signUpAction, IDLE);
  if (state.status === "done") {
    return (
      <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
        Check your email to confirm your account, then{" "}
        <Link href="/login" className="font-medium underline">sign in</Link>. Your pharmacy starts as{" "}
        <strong>pending</strong> until its FDA Licence to Operate is on file.
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      {[
        ["pharmacyName", "Pharmacy name", "text", "organization"],
        ["ownerName", "Your name", "text", "name"],
        ["phone", "Mobile number", "tel", "tel"],
        ["email", "Email", "email", "email"],
        ["password", "Password (8+ characters)", "password", "new-password"],
      ].map(([name, label, type, ac]) => (
        <label key={name} className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">{label}</span>
          <input name={name} type={type} required autoComplete={ac} minLength={name === "password" ? 8 : undefined} className={input} />
        </label>
      ))}
      <ReferralCodeField
        lookupPath="/api/agent-code"
        defaultValue={initialCode}
        labelClassName="block text-sm font-medium text-slate-700"
        inputClassName={`${input} mt-1 uppercase`}
      />
      {state.status === "error" && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-900">{state.message}</p>
      )}
      <button type="submit" disabled={pending} className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
        {pending ? "Creating…" : "Create pharmacy account"}
      </button>
    </form>
  );
}
