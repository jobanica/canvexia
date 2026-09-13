"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { schedulePost, startSocialConnect, type SocialState } from "@/server/social/actions";
import { SOCIAL_PLATFORMS } from "@/lib/social/platforms";
import { SubmitButton } from "../SubmitButton";

/**
 * Compose a post and either publish it now or hand it a date/time. Platforms the
 * restaurant hasn't linked yet are disabled, with a Connect button that opens
 * Upload-Post's hosted linking page.
 */
export function ComposePost({ connected }: { connected: string[] }) {
  const [state, action] = useActionState<SocialState, FormData>(schedulePost, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [when, setWhen] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectErr, setConnectErr] = useState<string | null>(null);
  const linked = new Set(connected);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setWhen("");
    }
  }, [state]);

  async function connect() {
    setConnecting(true);
    setConnectErr(null);
    const res = await startSocialConnect();
    if ("url" in res) {
      window.location.href = res.url;
      return;
    }
    setConnecting(false);
    setConnectErr(res.error);
  }

  return (
    <div className="space-y-4">
      {/* Connected accounts */}
      <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-heading font-bold">Connected accounts</h2>
            <p className="text-sm text-plum-ink/55">
              {connected.length > 0
                ? "Servd can post to these on your behalf."
                : "Connect an account to start posting."}
            </p>
          </div>
          <button
            type="button"
            onClick={connect}
            disabled={connecting}
            className="rounded-full px-4 py-2 text-sm font-semibold btn-brand disabled:opacity-50"
          >
            {connecting ? "Opening…" : connected.length > 0 ? "Manage accounts" : "Connect accounts"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {SOCIAL_PLATFORMS.map((p) => (
            <span
              key={p.key}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                linked.has(p.key) ? "bg-mango/15 text-mango" : "bg-plum-ink/5 text-plum-ink/40"
              }`}
            >
              {linked.has(p.key) ? "✓ " : ""}{p.label}
            </span>
          ))}
        </div>
        {connectErr && <p className="mt-2 text-sm text-guava">{connectErr}</p>}
      </div>

      {/* Composer */}
      <form ref={formRef} action={action} className="rounded-tile border border-plum-ink/10 bg-white p-4">
        <h2 className="font-heading font-bold">New post</h2>

        <textarea
          name="caption"
          rows={4}
          maxLength={2000}
          required
          placeholder="What's happening at your restaurant? e.g. Bagong luto! Crispy pata all day today 🔥"
          className="mt-3 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
        />

        <div className="mt-3">
          <p className="mb-1 text-xs font-semibold text-plum-ink/60">Post to</p>
          <div className="flex flex-wrap gap-2">
            {SOCIAL_PLATFORMS.map((p) => {
              const on = linked.has(p.key);
              return (
                <label
                  key={p.key}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
                    on ? "border-plum-ink/15 text-plum-ink" : "border-plum-ink/10 text-plum-ink/35"
                  }`}
                  title={on ? undefined : "Connect this account first"}
                >
                  <input type="checkbox" name="platforms" value={p.key} disabled={!on} />
                  {p.label}
                </label>
              );
            })}
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-plum-ink/60">Photo (optional)</label>
            <input
              type="file"
              name="photo"
              accept="image/png,image/jpeg,image/webp"
              className="w-full text-xs"
            />
            <p className="mt-1 text-[11px] text-plum-ink/45">Max 8 MB. Instagram and TikTok need an image.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-plum-ink/60">
              Schedule for (leave blank to post now)
            </label>
            <input
              type="datetime-local"
              name="scheduledFor"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-[11px] text-plum-ink/45">Philippine time.</p>
          </div>
        </div>

        {state?.error && <p className="mt-3 text-sm text-guava">{state.error}</p>}
        {state?.ok && <p className="mt-3 text-sm font-semibold text-mango">Post sent.</p>}

        <div className="mt-4">
          <SubmitButton>{when ? "Schedule post" : "Post now"}</SubmitButton>
        </div>
      </form>
    </div>
  );
}
