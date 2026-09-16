"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createKioskAction, updateKioskAction, type KioskState } from "@/server/partners/kiosk-actions";
import type { KioskRow } from "@/server/partners/kiosk";

const initial: KioskState = null;

/**
 * Add a kiosk, open its display, switch it off, or give it a new code.
 *
 * "NEW CODE" IS SPELLED OUT rather than called "rotate secret". The person
 * doing this has just watched somebody photograph the screen, and the sentence
 * they need is what happens next: every code from the old screen stops working
 * within a minute or two.
 */
export function KioskManager({ kiosks }: { kiosks: KioskRow[] }) {
  const [addState, add, adding] = useActionState(createKioskAction, initial);
  const [editState, edit] = useActionState(updateKioskAction, initial);
  const field =
    "min-h-[44px] w-full rounded-lg border border-brand-ink/15 bg-white px-3 text-sm outline-none focus:border-brand-ink";

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
        <ul className="divide-y divide-brand-ink/[0.07]">
          {kiosks.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span>
                <span className="block text-sm font-semibold">{k.label}</span>
                <span className="block text-xs text-brand-ink/45">
                  {k.active ? "on" : "switched off"}
                  {k.lat !== null && k.lng !== null && " · located"}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-3">
                {k.active && (
                  <Link
                    href={`/partner/attendance/kiosk/${k.id}`}
                    className="text-xs font-semibold text-brand-primary hover:underline"
                  >
                    Open display
                  </Link>
                )}
                <form action={edit}>
                  <input type="hidden" name="kioskId" value={k.id} />
                  <input type="hidden" name="intent" value="rotate" />
                  <button
                    title="Every code from the old screen stops working within a minute."
                    className="text-xs font-semibold text-brand-ink/60 hover:underline"
                  >
                    New code
                  </button>
                </form>
                <form action={edit}>
                  <input type="hidden" name="kioskId" value={k.id} />
                  <input type="hidden" name="intent" value={k.active ? "deactivate" : "activate"} />
                  <button
                    className={`text-xs font-semibold hover:underline ${
                      k.active ? "text-guava" : "text-brand-primary"
                    }`}
                  >
                    {k.active ? "Switch off" : "Switch on"}
                  </button>
                </form>
              </span>
            </li>
          ))}
          {kiosks.length === 0 && (
            <li className="px-4 py-6 text-sm text-brand-ink/50">
              No kiosks yet. Add one below, then open its display on a tablet at the
              counter.
            </li>
          )}
        </ul>
      </section>

      {editState?.error && (
        <p role="alert" className="text-sm text-guava">
          {editState.error}
        </p>
      )}

      <form action={add} className="rounded-tile border border-brand-ink/10 bg-white p-5">
        <p className="text-sm font-semibold">Add a kiosk</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
          <input name="label" required placeholder="Front counter" className={field} />
          <button
            disabled={adding}
            className="min-h-[44px] rounded-full bg-brand-ink px-6 text-sm font-semibold text-white disabled:opacity-60"
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </div>
        {/* Optional and empty by default. A kiosk is usually a tablet on a
            counter nobody has geocoded, and a made-up coordinate would put a
            false pin on the manager's map. */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input name="lat" inputMode="decimal" placeholder="Latitude (optional)" className={field} />
          <input name="lng" inputMode="decimal" placeholder="Longitude (optional)" className={field} />
        </div>
        {addState?.error && (
          <p role="alert" className="mt-3 text-sm text-guava">
            {addState.error}
          </p>
        )}
        <p className="mt-4 text-xs leading-relaxed text-brand-ink/45">
          The display shows a code that changes every minute, and a scan is good for up to
          two. Staff still send their location when they clock in — the code proves which
          screen they stood at.
        </p>
      </form>
    </div>
  );
}
