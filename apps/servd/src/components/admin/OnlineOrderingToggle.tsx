"use client";

import { useActionState } from "react";
import { setOrdersPaused, type PauseState } from "@/server/storefront/actions";

/**
 * Stop and resume online orders in one tap.
 *
 * Sits at the top of the storefront settings, above everything, because it's
 * used mid-service while the kitchen is buried — not while calmly editing
 * settings. It saves on its own; there's no Save button to find.
 *
 * Deliberately has no timer. A pause that expires by itself would let orders
 * start arriving again at a moment nobody chose, which is exactly the surprise
 * this exists to prevent.
 */
export function OnlineOrderingToggle({ paused: initial }: { paused: boolean }) {
  const [state, action, pending] = useActionState<PauseState, FormData>(setOrdersPaused, null);
  // The server's answer wins once we have one; before that, what the page loaded.
  const paused = state?.paused ?? initial;

  return (
    <form
      action={action}
      className={`rounded-tile border p-5 ${
        paused ? "border-guava/40 bg-guava/5" : "border-plum-ink/10 bg-white"
      }`}
    >
      <input type="hidden" name="paused" value={paused ? "false" : "true"} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-lg font-bold">
            {paused ? "⏸ Online orders are paused" : "🟢 Taking online orders"}
          </p>
          <p className="mt-1 text-sm text-plum-ink/60">
            {paused
              ? "Customers can see your menu but can't order. Nothing new reaches the kitchen until you turn it back on."
              : "Pause this when the kitchen is at capacity. Your menu stays visible — customers just can't check out."}
          </p>
        </div>
        <button
          disabled={pending}
          className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-60 ${
            paused
              ? "btn-brand text-white"
              : "border border-guava text-guava hover:bg-guava/10"
          }`}
        >
          {pending ? "Saving…" : paused ? "Start taking orders" : "Pause online orders"}
        </button>
      </div>
      {state?.error && <p className="mt-2 text-sm text-guava">{state.error}</p>}
      {paused && (
        <p className="mt-3 text-xs text-plum-ink/50">
          Dine-in QR ordering and the cashier POS are unaffected — this only stops the online
          store. It stays paused until you switch it back on.
        </p>
      )}
    </form>
  );
}
