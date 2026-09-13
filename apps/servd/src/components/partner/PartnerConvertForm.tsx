"use client";

import { useActionState } from "react";
import { convertPartnerDemo, type PartnerConvertState } from "@/server/partners/demo";

/**
 * "They said yes" — hand this storefront a login and it becomes their account.
 *
 * The credentials are shown ONCE, right here, and never again: the password is
 * generated server-side and only exists in this response. So the success state
 * has to be impossible to miss and easy to copy off the screen while the
 * partner is standing in front of the owner.
 */
export function PartnerConvertForm({ restaurantId }: { restaurantId: string }) {
  const [state, action, pending] = useActionState<PartnerConvertState, FormData>(
    convertPartnerDemo,
    null,
  );

  if (state?.ok && state.credentials) {
    return (
      <div className="rounded-tile border border-mango/40 bg-mango/10 p-4">
        <p className="font-heading font-bold text-plum-ink">✅ It&apos;s a real account now</p>
        <p className="mt-1 text-sm text-plum-ink/70">
          Give these to the owner — this is the only time the password is shown. They can change
          both from their dashboard once they&apos;re in. Everything they&apos;ve already seen (menu,
          link, QR) carries over.
        </p>
        <div className="mt-2 space-y-1 rounded-lg bg-white/70 p-3 font-mono text-sm">
          <div>
            Username: <strong>{state.credentials.username}</strong>
          </div>
          <div>
            Password: <strong>{state.credentials.password}</strong>
          </div>
        </div>
        <p className="mt-2 text-xs text-plum-ink/50">
          On the ₱0 Free plan — Servd bills them nothing. What they pay you is between you and
          them.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="rounded-tile border border-plum-ink/10 bg-white p-4">
      <p className="font-heading font-bold text-plum-ink">Convert to a real account</p>
      <p className="text-xs text-plum-ink/55">
        They said yes? Pick their login username and this demo becomes their account — same menu,
        same link, same QR codes. Starts on the ₱0 Free plan; you bill them yourself.
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
