"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createBusinessAccount, type ActionState } from "@/server/billing/super-admin-actions";
import { LocationPicker } from "@/components/site/LocationPicker";

export function CreateAccountForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createBusinessAccount, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setCoords(null);
    }
  }, [state]);

  const field = "w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm";
  const label = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-plum-ink/45";

  return (
    <form ref={formRef} action={action} className="space-y-4 rounded-tile border border-plum-ink/10 bg-white p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Business name</label>
          <input name="restaurantName" required className={field} />
        </div>
        <div>
          <label className={label}>Username (their login)</label>
          <input name="username" required autoComplete="off" placeholder="e.g. torks" className={field} />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Business address</label>
          <input name="businessAddress" placeholder="Street, city" className={field} />
        </div>
      </div>

      <div>
        <label className={label}>Pin the location on the map</label>
        <LocationPicker onChange={(lat, lng) => setCoords({ lat, lng })} />
        <input type="hidden" name="latitude" value={coords?.lat ?? ""} />
        <input type="hidden" name="longitude" value={coords?.lng ?? ""} />
        {coords && (
          <p className="mt-1 text-xs text-plum-ink/45">
            Pinned at {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded-full px-4 py-2 text-sm font-semibold btn-brand disabled:opacity-60">
          {pending ? "Creating…" : "Create business"}
        </button>
        {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      </div>

      {state?.ok && state.credentials && (
        <div className="rounded-tile border border-mango/30 bg-mango/5 p-3">
          <p className="text-sm text-plum-ink">{state.message}</p>
          <div className="mt-2 grid gap-1 font-mono text-sm">
            <div>Username: <strong>{state.credentials.username}</strong></div>
            <div>Temp password: <strong>{state.credentials.password}</strong></div>
          </div>
          <button
            type="button"
            onClick={() => {
              const text = `Username: ${state.credentials!.username}\nPassword: ${state.credentials!.password}`;
              navigator.clipboard?.writeText(text).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            className="mt-2 rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold"
          >
            {copied ? "Copied ✓" : "Copy login details"}
          </button>
          <p className="mt-1 text-xs text-plum-ink/45">
            The owner signs in with this username + temp password, then sets their own email &amp;
            password from the dashboard.
          </p>
        </div>
      )}

      <p className="text-xs text-plum-ink/45">
        No email needed — create with a business name, a username, and the location. The owner adds
        their email from their dashboard later.
      </p>
    </form>
  );
}
