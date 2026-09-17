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
 *
 * WHICH IS WHY `alreadyConverted` IS A PROP AND NOT A REASON NOT TO RENDER.
 *
 * A server action re-renders the page's server tree when it finishes. A caller
 * that wrote `{!converted && <PartnerConvertForm/>}` therefore UNMOUNTED this
 * component the instant the conversion succeeded — `converted` had just become
 * true — and unmounting took `state` with it. The password exists nowhere else.
 * It was shown for no frames at all, and the account was left with a credential
 * nobody had.
 *
 * So the parent renders this whenever a conversion is POSSIBLE OR HAS JUST
 * HAPPENED, and passes what it knows. The component decides what to show, and
 * its own state always wins: credentials in hand are displayed even after the
 * page agrees the account is converted.
 */
export function PartnerConvertForm({
  restaurantId,
  alreadyConverted = false,
}: {
  restaurantId: string;
  /** True once the server can see a login. Never used to skip rendering. */
  alreadyConverted?: boolean;
}) {
  const [state, action, pending] = useActionState<PartnerConvertState, FormData>(
    convertPartnerDemo,
    null,
  );

  if (state?.ok && state.credentials) {
    return (
      <div className="rounded-tile border border-brand-primary/40 bg-brand-primary/10 p-4">
        <p className="font-heading font-bold text-brand-ink">✅ It&apos;s a real account now</p>
        <p className="mt-1 text-sm text-brand-ink/70">
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
        <p className="mt-2 text-xs text-brand-ink/50">
          On Standard — everything except the content scheduler, which is its own ₱499/mo.
          What they pay you is between you and them, at ₱999/mo or above.
        </p>
      </div>
    );
  }

  // Converted by somebody else, or on an earlier visit: there is nothing to
  // offer and no credentials in hand. The parent shows the username instead.
  if (alreadyConverted) return null;

  return (
    <form action={action} className="rounded-tile border border-brand-ink/10 bg-white p-4">
      <p className="font-heading font-bold text-brand-ink">Convert to a real account</p>
      <p className="text-xs text-brand-ink/55">
        They said yes? Pick their login username and this demo becomes their account — same menu,
        same link, same QR codes, and everything unlocked except the content scheduler. You bill
        them yourself, at ₱999/mo or above.
      </p>
      {/*
        STACKED, AND THE BUTTON IS FULL WIDTH. Laid out as a wrapping row, the
        button landed on its own line past the right edge of a narrow column and
        read as absent — so people pressed Enter in the single text field, which
        submits the form implicitly, and the conversion happened before they
        believed they had asked for it.
      */}
      <div className="mt-3 space-y-2">
        <input type="hidden" name="restaurantId" value={restaurantId} />
        <input
          name="username"
          required
          autoComplete="off"
          placeholder="username (their login)"
          className="min-h-[44px] w-full rounded-lg border border-brand-ink/15 px-3 py-2 text-sm"
        />
        <button
          disabled={pending}
          className="min-h-[44px] w-full rounded-full bg-brand-gradient px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Converting…" : "Convert to a real account"}
        </button>
      </div>
      {state?.error && <p className="mt-2 text-sm text-guava">{state.error}</p>}
    </form>
  );
}
