"use client";

import { useActionState, useState } from "react";
import { saveLandingVideo, type LandingVideoState } from "@/server/landing/actions";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { youtubeId, autoPoster } from "@/lib/video";

/**
 * The how-it-works video on /create, set by pasting a YouTube link.
 *
 * Deliberately not an environment variable: swapping the video is a marketing
 * decision made while looking at the numbers on this page, and it shouldn't
 * need a deploy to happen.
 *
 * The thumbnail comes from the link itself, which is why there's only one
 * field — there's no second question about a poster image nobody has to hand.
 */
export function LandingVideoForm({ initial }: { initial: string }) {
  const [state, action] = useActionState<LandingVideoState, FormData>(saveLandingVideo, null);
  const [url, setUrl] = useState(initial);

  const id = youtubeId(url);
  const poster = autoPoster(url);

  return (
    <form action={action} className="rounded-tile border border-plum-ink/10 bg-white p-4">
      <h2 className="font-heading text-lg font-bold">Landing page video</h2>
      <p className="text-sm text-plum-ink/50">
        Shown in the &ldquo;See how easy it is&rdquo; section of{" "}
        <a
          href="/create"
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-brand-primary hover:underline"
        >
          /create
        </a>
        . Paste the YouTube link — leave it empty and the section shows just the four steps.
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <input
            name="videoUrl"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 font-mono text-sm"
          />
          {url && !id && (
            <p className="mt-1.5 text-xs text-plum-ink/45">
              Not recognised as YouTube yet — a Vimeo link or a direct .mp4 also works.
            </p>
          )}
        </div>

        {/* What the visitor sees before they tap. Loaded from YouTube, so a
            broken thumbnail here is the same broken thumbnail they'd get. */}
        {poster && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={poster}
            alt=""
            className="h-[72px] w-32 shrink-0 rounded-lg border border-plum-ink/10 object-cover"
          />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <SubmitButton>Save</SubmitButton>
        {url && (
          <button
            type="button"
            onClick={() => setUrl("")}
            className="text-xs font-semibold text-plum-ink/50 hover:text-guava"
          >
            Remove video
          </button>
        )}
        {state?.ok && <span className="text-sm text-green-700">Saved — live on /create now.</span>}
        {state?.error && <span className="text-sm text-guava">{state.error}</span>}
      </div>
    </form>
  );
}
