"use client";

import { useState } from "react";
import { parseVideoSource } from "@/lib/video";

/**
 * Diner video player. Native <video> for files (lazy: preload="none", no
 * autoplay). For YouTube/Vimeo, shows a poster "facade" and only loads the
 * iframe on tap — so nothing ever plays with sound on its own.
 */
export function VideoPlayer({ url, poster }: { url: string; poster?: string | null }) {
  const src = parseVideoSource(url);
  const [play, setPlay] = useState(false);

  if (src.kind === "file") {
    return (
      <video
        controls
        playsInline
        preload="none"
        poster={poster ?? undefined}
        className="w-full rounded-lg bg-black"
      >
        <source src={src.url} />
      </video>
    );
  }

  if (!play) {
    return (
      <button
        onClick={() => setPlay(true)}
        className="relative block aspect-video w-full overflow-hidden rounded-lg bg-black"
        aria-label="Play video"
      >
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt="" className="h-full w-full object-cover opacity-80" />
        ) : null}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-2xl text-brand-ink">
            ▶
          </span>
        </span>
      </button>
    );
  }

  const embed = `${src.embedUrl}?autoplay=1${src.kind === "youtube" ? "&rel=0" : ""}`;
  return (
    <iframe
      src={embed}
      className="aspect-video w-full rounded-lg"
      allow="autoplay; fullscreen; picture-in-picture"
      allowFullScreen
    />
  );
}
