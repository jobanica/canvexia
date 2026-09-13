"use client";

import { useActionState } from "react";
import { setPartnerTrainingUrl, type TrainingState } from "@/server/partners/admin";

/**
 * Super-admin: set the partner training video (a YouTube/Vimeo link or a direct
 * video URL). Shown to partners on their dashboard. Leave blank to remove.
 */
export function PartnerTrainingForm({ current }: { current: string | null }) {
  const [state, action] = useActionState<TrainingState, FormData>(setPartnerTrainingUrl, null);

  return (
    <form action={action} className="space-y-2">
      <label className="block text-xs font-semibold uppercase tracking-wide text-plum-ink/50">
        Training video URL
      </label>
      <input
        name="url"
        type="url"
        defaultValue={current ?? ""}
        placeholder="https://youtu.be/… or a direct .mp4 URL"
        className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
      />
      <p className="text-xs text-plum-ink/45">
        Paste a YouTube or Vimeo link, or a direct video file URL. To use your own file, upload it to
        YouTube (unlisted) or storage and paste the link. Leave blank to remove the video.
      </p>
      <div className="flex items-center gap-3">
        <button className="rounded-full px-5 py-2 text-sm font-semibold btn-brand text-white">
          Save video
        </button>
        {state?.error && <span className="text-sm text-guava">{state.error}</span>}
        {state?.ok && <span className="text-sm text-mango">Saved ✓</span>}
      </div>
    </form>
  );
}
