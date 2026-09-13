"use client";

import { useActionState, useState } from "react";
import { setAutoAccept, type AutoAcceptState } from "@/server/storefront/actions";
import {
  AUTO_ACCEPT_CHOICES,
  AUTO_ACCEPT_DEFAULT_SECONDS,
  autoAcceptLabel,
} from "@/lib/orders/auto-accept";

/**
 * Accept an online order by itself when nobody answers it.
 *
 * Sits under the pause switch, because the two are the same kind of decision —
 * how the shop behaves when the counter is busy — and neither belongs behind a
 * Save button at the bottom of a long settings page.
 *
 * Off by default and stated as off: this sends food to the kitchen without a
 * person agreeing to it, so it has to be switched on deliberately, and the card
 * has to say plainly what it will and won't do.
 */
export function AutoAcceptToggle({ seconds: initial }: { seconds: number | null }) {
  const [state, action, pending] = useActionState<AutoAcceptState, FormData>(setAutoAccept, null);
  // The server's answer wins once we have one; before that, what the page loaded.
  const saved = state?.ok ? state.seconds ?? null : initial;
  const on = saved != null;
  const [choice, setChoice] = useState<number>(saved ?? AUTO_ACCEPT_DEFAULT_SECONDS);

  return (
    <div
      className={`rounded-tile border p-5 ${
        on ? "border-brand-primary/40 bg-brand-primary/5" : "border-plum-ink/10 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-lg font-bold">
            {on ? `⚡ Auto-accepting after ${autoAcceptLabel(saved)}` : "🖐 Every order waits for you"}
          </p>
          <p className="mt-1 text-sm text-plum-ink/60">
            {on
              ? "An online order nobody has answered goes to the kitchen by itself, so the customer isn't left waiting for a confirmation while the counter is busy."
              : "Online orders sit in Incoming until somebody taps Accept. Turn this on to have them accepted for you when nobody gets to the tablet in time."}
          </p>
        </div>

        <form action={action} className="flex shrink-0 items-center gap-2">
          <input type="hidden" name="on" value={on ? "false" : "true"} />
          <input type="hidden" name="seconds" value={choice} />
          <button
            disabled={pending}
            className={`rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-60 ${
              on ? "border border-plum-ink/20 text-plum-ink/70 hover:bg-plum-ink/5" : "btn-brand text-white"
            }`}
          >
            {pending ? "Saving…" : on ? "Turn off" : "Turn on"}
          </button>
        </form>
      </div>

      {/* Changing the wait is its own submit, so picking a number never toggles
          the feature and toggling never silently changes the number. */}
      <form action={action} className="mt-4 flex flex-wrap items-center gap-2">
        <input type="hidden" name="on" value="true" />
        <label className="text-sm text-plum-ink/70">
          Wait
          <select
            name="seconds"
            value={choice}
            onChange={(e) => setChoice(Number(e.target.value))}
            className="ml-2 rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm"
          >
            {AUTO_ACCEPT_CHOICES.map((s) => (
              <option key={s} value={s}>
                {autoAcceptLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={pending || (on && choice === saved)}
          className="rounded-full border border-plum-ink/20 px-4 py-1.5 text-xs font-semibold text-plum-ink/70 disabled:opacity-40"
        >
          {on ? "Change wait" : "Turn on with this wait"}
        </button>
      </form>

      {state?.error && <p className="mt-2 text-sm text-guava">{state.error}</p>}

      {on && (
        <ul className="mt-3 space-y-1 text-xs text-plum-ink/55">
          <li>
            • Online orders only. Dine-in QR orders still wait for somebody at the till, and an
            advance order booked for later is never accepted early.
          </li>
          <li>
            • It runs while a staff screen is open — the Incoming Orders screen or the cashier
            board. With nothing open anywhere, an order waits for a person as it always did.
          </li>
          <li>
            • Kitchen tickets print automatically only on a network or cloud printer. A Bluetooth
            or print-dialog printer is paired inside a browser, so it needs somebody there.
          </li>
        </ul>
      )}
    </div>
  );
}
