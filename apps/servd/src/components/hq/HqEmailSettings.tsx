"use client";

import { useActionState } from "react";
import { saveHqEmailAction, type HqEmailState } from "@/server/hq/email-actions";

/**
 * The sending credentials, and whether they are working.
 *
 * THE QUEUE IS ON THIS SCREEN ON PURPOSE. "Configured" only means a key is
 * stored; it does not mean the provider still accepts it. A rotated or revoked
 * key looks identical on a settings page and shows up as a queue that stops
 * draining — so the count and the provider's last complaint sit next to the
 * field that fixes them.
 */
export function HqEmailSettings({
  status,
  queued,
  parked,
  lastError,
}: {
  status: { configured: boolean; fromName: string; fromEmail: string; replyTo: string };
  queued: number;
  parked: number;
  lastError: string | null;
}) {
  const [state, save, saving] = useActionState<HqEmailState, FormData>(saveHqEmailAction, null);
  const field =
    "min-h-[44px] w-full rounded-lg border border-brand-ink/15 bg-white px-3 text-sm outline-none focus:border-brand-ink";

  return (
    <div className="max-w-readable space-y-5">
      <section
        className={`rounded-tile border p-4 text-sm ${
          lastError
            ? "border-guava/30 bg-guava/[0.04]"
            : status.configured
              ? "border-brand-primary/25 bg-brand-primary/[0.04]"
              : "border-mango/40 bg-mango/10"
        }`}
      >
        <p className="font-semibold">
          {!status.configured
            ? "No sending account configured"
            : lastError
              ? "Configured, but the provider is refusing"
              : "Sending as " + (status.fromEmail || "—")}
        </p>
        <p className="mt-1 text-xs text-brand-ink/60">
          {queued.toLocaleString("en-PH")} waiting to go out
          {parked > 0 && ` · ${parked.toLocaleString("en-PH")} gave up after 5 tries`}
        </p>
        {lastError && (
          // The provider's own words. "API key is invalid" is actionable;
          // "email is broken" is not.
          <p className="mt-2 break-all font-mono text-xs text-guava">{lastError}</p>
        )}
      </section>

      <form action={save} className="space-y-4 rounded-tile border border-brand-ink/10 bg-white p-5">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-ink/50">
            API key
          </span>
          <input
            name="apiKey"
            type="password"
            autoComplete="off"
            placeholder={status.configured ? "•••••••• — leave blank to keep the current key" : "re_…"}
            className={`${field} mt-1`}
          />
          {/* Never shown back. Blank means keep, so a half-filled save cannot
              wipe a working configuration. */}
          <span className="mt-1 block text-xs text-brand-ink/45">
            From resend.com → API Keys. It is never displayed again after saving.
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-brand-ink/50">
              From name
            </span>
            <input name="fromName" defaultValue={status.fromName} className={`${field} mt-1`} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-brand-ink/50">
              From address
            </span>
            <input
              name="fromEmail"
              type="email"
              defaultValue={status.fromEmail}
              placeholder="noreply@canvexia.com"
              className={`${field} mt-1`}
            />
          </label>
        </div>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-ink/50">
            Reply-to <span className="font-normal normal-case text-brand-ink/40">(optional)</span>
          </span>
          <input name="replyTo" type="email" defaultValue={status.replyTo} className={`${field} mt-1`} />
        </label>

        {state?.error && (
          <p role="alert" className="text-sm text-guava">
            {state.error}
          </p>
        )}
        {state?.ok && <p className="text-sm text-brand-primary">{state.message}</p>}

        <button
          disabled={saving}
          className="min-h-[44px] rounded-full bg-brand-ink px-6 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </form>

      <p className="text-xs leading-relaxed text-brand-ink/45">
        One account sends for both brands — <strong>canvexia.com</strong> and{" "}
        <strong>servdph.com</strong> are both verified on it, and the from-address above
        decides which one a message appears to come from. Saving here is the same setting
        as Servd&rsquo;s own email screen; this is a second door, not a second
        configuration.
      </p>
    </div>
  );
}
