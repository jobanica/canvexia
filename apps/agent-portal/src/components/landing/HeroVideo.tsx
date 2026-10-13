import { Icon } from "../icons";

/**
 * The hero explainer video.
 *
 * The source is read from `NEXT_PUBLIC_EXPLAINER_VIDEO_URL` so it can be
 * swapped without a code change — set it in Vercel's env (or `.env` locally):
 *   - a YouTube or Vimeo link → embedded player
 *   - a direct file (e.g. `/explainer.mp4` dropped in `public/`, or any
 *     `.mp4`/`.webm` URL) → an HTML5 <video>
 * Left unset, a branded placeholder shows, so the hero still looks finished.
 *
 * The iframe loads lazily and the file preloads nothing, so an unwatched video
 * costs a visitor on mobile data almost nothing.
 */
function youTubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/);
  return m ? m[1] : null;
}
function vimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? m[1] : null;
}

export function HeroVideo() {
  const url = process.env.NEXT_PUBLIC_EXPLAINER_VIDEO_URL?.trim();
  const yt = url ? youTubeId(url) : null;
  const vm = url && !yt ? vimeoId(url) : null;

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-[#171325] shadow-2xl shadow-black/40">
      {yt ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${yt}?rel=0`}
          title="Panoorin: Canvexia Agent Program"
          loading="lazy"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : vm ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://player.vimeo.com/video/${vm}`}
          title="Panoorin: Canvexia Agent Program"
          loading="lazy"
          allow="fullscreen; picture-in-picture"
          allowFullScreen
        />
      ) : url ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video className="absolute inset-0 h-full w-full bg-black object-contain" controls preload="none" playsInline>
          <source src={url} />
        </video>
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_center,_#3a2d6e_0%,_#171325_70%)]">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/20 backdrop-blur">
              <Icon name="play" className="h-7 w-7 translate-x-0.5" />
            </span>
            <p className="text-sm font-medium text-white/80">Explainer video</p>
            <p className="max-w-[16rem] text-xs text-white/50">
              Panoorin kung paano kumita bilang Canvexia agent.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
