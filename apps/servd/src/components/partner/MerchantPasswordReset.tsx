"use client";

import { useActionState } from "react";
import { resetMerchantPassword, type ResetPasswordState } from "@/server/partners/demo";

/**
 * Re-issue the owner's password, and show it once.
 *
 * WHY A MERCHANT NEEDS THIS AT ALL: conversion shows the password exactly once
 * because it only exists in that one response. That is the right property and
 * it had nothing behind it — when the convert form was unmounted by the very
 * re-render its own success caused, the password was shown for no frames and
 * the account was left with a credential nobody had. The owner could not
 * recover it either: their login is a synthetic address at a domain that
 * receives no mail, so "reset it from the sign-in page" was advice that went
 * nowhere.
 *
 * Kept deliberately unlike a primary action — a quiet link, one confirmation —
 * because resetting a password the owner is already using locks them out until
 * somebody reads them the new one.
 */
export function MerchantPasswordReset({ restaurantId }: { restaurantId: string }) {
  const [state, action, pending] = useActionState<ResetPasswordState, FormData>(
    resetMerchantPassword,
    null,
  );

  if (state && "ok" in state) {
    return (
      <div className="mt-3 rounded-tile border border-brand-primary/40 bg-brand-primary/10 p-4">
        <p className="font-heading font-bold text-brand-ink">New password set</p>
        <p className="mt-1 text-sm text-brand-ink/70">
          Read these to the owner now — this is the only time the password is shown. The
          old one no longer works.
        </p>
        <div className="mt-2 space-y-1 rounded-lg bg-white/70 p-3 font-mono text-sm">
          <div>
            Username: <strong>{state.login}</strong>
          </div>
          <div>
            Password: <strong>{state.password}</strong>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <button
        disabled={pending}
        className="min-h-[44px] rounded-full border border-brand-ink/15 px-4 text-sm font-semibold text-brand-ink/70 hover:bg-brand-surface disabled:opacity-50"
      >
        {pending ? "Setting a new one…" : "Set a new password"}
      </button>
      <p className="mt-1.5 text-xs text-brand-ink/45">
        Use this if nobody has the password. It replaces the current one, so the owner is
        locked out until you read them the new one.
      </p>
      {state && "error" in state && (
        <p className="mt-2 text-sm text-guava">{state.error}</p>
      )}
    </form>
  );
}
