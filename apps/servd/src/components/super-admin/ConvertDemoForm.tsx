"use client";

import { useActionState } from "react";
import { convertDemoToAccount, type ConvertState } from "@/server/storefront-demo/actions";

export function ConvertDemoForm({ restaurantId }: { restaurantId: string }) {
  const [state, action, pending] = useActionState<ConvertState, FormData>(convertDemoToAccount, null);

  if (state?.ok && state.credentials) {
    return (
      <div className="rounded-tile border border-mango/40 bg-mango/10 p-4">
        <p className="font-heading font-bold text-plum-ink">✅ Converted to a real account</p>
        <p className="mt-1 text-sm text-plum-ink/70">
          Hand these login details to the owner — they can change their email &amp; password from the
          dashboard. A fresh 30-day Business trial just started.
        </p>
        <div className="mt-2 space-y-1 rounded-lg bg-white/70 p-3 font-mono text-sm">
          <div>Username: <strong>{state.credentials.username}</strong></div>
          <div>Password: <strong>{state.credentials.password}</strong></div>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="rounded-tile border border-plum-ink/10 bg-white p-4">
      <p className="font-heading font-bold text-plum-ink">Convert to a real account</p>
      <p className="text-xs text-plum-ink/55">
        They said yes? Give this storefront a login — the menu they already saw carries over, and a
        fresh 30-day Business trial starts.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="restaurantId" value={restaurantId} />
        <input
          name="username"
          required
          placeholder="username (their login)"
          className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
        />
        <button
          disabled={pending}
          className="rounded-full bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Converting…" : "Convert → real account"}
        </button>
      </div>
      {state?.error && <p className="mt-2 text-sm text-guava">{state.error}</p>}
    </form>
  );
}
