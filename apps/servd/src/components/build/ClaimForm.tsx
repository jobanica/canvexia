"use client";

import { useActionState } from "react";
import Link from "next/link";
import { submitClaim, type ClaimState } from "@/server/build/claim";
import { SubmitButton } from "@/components/admin/SubmitButton";

export function ClaimForm({
  token,
  restaurantName,
  username,
}: {
  token: string;
  restaurantName: string;
  username: string;
}) {
  const [state, action] = useActionState<ClaimState, FormData>(submitClaim, null);

  if (state?.ok) {
    return (
      <div className="mx-auto max-w-md rounded-tile border border-plum-ink/10 bg-white p-6 text-center">
        <div className="text-4xl">✅</div>
        <h1 className="mt-3 font-heading text-2xl font-bold text-plum-ink">You&apos;re all set</h1>
        <p className="mt-1 text-sm text-plum-ink/55">
          Sign in with <span className="font-mono font-bold">{state.username || username}</span> and
          the password you just chose.
        </p>
        <Link
          href="/login"
          className="mt-5 block w-full rounded-full py-3.5 font-heading text-base font-bold btn-brand"
        >
          Go to my dashboard →
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="mx-auto max-w-md rounded-tile border border-plum-ink/10 bg-white p-6">
      <h1 className="font-heading text-2xl font-bold text-plum-ink">Set your password</h1>
      <p className="mt-1 text-sm text-plum-ink/55">
        For <strong>{restaurantName}</strong>. Your username is{" "}
        <span className="font-mono font-bold">{username}</span>.
      </p>

      <input type="hidden" name="token" value={token} />

      <label className="mt-5 block text-sm font-semibold text-plum-ink/70">New password</label>
      <input
        name="password"
        type="password"
        required
        minLength={8}
        autoFocus
        placeholder="At least 8 characters"
        className="mt-1 w-full rounded-xl border border-plum-ink/15 px-3 py-3 text-base"
      />

      <label className="mt-4 block text-sm font-semibold text-plum-ink/70">
        Email <span className="font-normal text-plum-ink/40">(optional)</span>
      </label>
      <p className="text-xs text-plum-ink/45">Add one and you can sign in with it too.</p>
      <input
        name="email"
        type="email"
        placeholder="you@example.com"
        className="mt-1 w-full rounded-xl border border-plum-ink/15 px-3 py-3 text-base"
      />

      {state?.error && <p className="mt-3 text-sm text-guava">{state.error}</p>}

      <div className="mt-6">
        <SubmitButton pendingLabel="Saving…" className="w-full rounded-full py-3.5 text-base">
          Save and sign in
        </SubmitButton>
      </div>
    </form>
  );
}
