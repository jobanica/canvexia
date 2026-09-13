"use client";

import { useActionState, useState } from "react";
import { changeWebAddress, type AddressState } from "@/server/restaurants/web-address-actions";
import { checkWebAddress, webAddressPreview } from "@/lib/restaurants/web-address";
import { SubmitButton } from "./SubmitButton";

/**
 * Correct the shop's web address.
 *
 * The address comes from whatever was typed as the restaurant name at signup —
 * the first thing anybody types, usually on a phone — so typos in it are
 * common, and until now permanent.
 *
 * Two things this screen owes the owner. A live preview of the real URL, so
 * they can see "mango-grill" before committing rather than after; and an honest
 * account of what changing it does to the QR codes already on their tables.
 */
export function WebAddressForm({ current, appUrl }: { current: string; appUrl: string }) {
  const [state, action] = useActionState<AddressState, FormData>(changeWebAddress, null);
  const [typed, setTyped] = useState(current);

  // What the server will make of it, worked out with the same function the
  // server uses — so the preview is the answer, not a guess at it.
  const checked = checkWebAddress(typed, current);
  const saved = state?.ok ? state.slug ?? current : current;
  const preview = webAddressPreview(appUrl, checked.ok ? checked.slug : saved);
  const changed = checked.ok && checked.slug !== saved;

  return (
    <form action={action} className="rounded-tile border border-plum-ink/10 bg-white p-5">
      <h3 className="font-heading font-bold">Your web address</h3>
      <p className="mt-1 text-sm text-plum-ink/55">
        The part of your link that customers see. Fix it here if it was typed wrong when you
        signed up.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-plum-ink/45">{appUrl.replace(/^https?:\/\//, "")}/r/</span>
        <input
          name="address"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="mango-grill"
          className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
        />
        <SubmitButton>Change address</SubmitButton>
      </div>

      {/* Live preview. Typing "Mango Grill" and typing "mango-grill" land in the
          same place, and the owner should be able to see that before saving. */}
      <p className="mt-2 break-all font-mono text-xs text-plum-ink/50">
        {preview.site}
        {changed && <span className="ml-2 font-sans font-semibold text-brand-primary">← new</span>}
      </p>

      {typed.trim() && !checked.ok && typed !== current && (
        <p className="mt-2 text-sm text-guava">{checked.error}</p>
      )}
      {state?.error && <p className="mt-2 text-sm text-guava">{state.error}</p>}
      {state?.ok && (
        <p className="mt-2 text-sm text-mango">
          Changed. Your old links still work, so nothing you&apos;ve printed or posted is broken.
        </p>
      )}

      <div className="mt-4 rounded-lg border border-plum-ink/10 bg-cream/40 p-3">
        <p className="text-xs font-semibold text-plum-ink/70">What happens to your QR codes</p>
        <p className="mt-1 text-xs text-plum-ink/55">
          They keep working. Your previous address stays pointed at your shop, so table tents you
          have already printed and links you have already posted still open the right menu. New QR
          sheets you print will carry the new address.
        </p>
      </div>
    </form>
  );
}
