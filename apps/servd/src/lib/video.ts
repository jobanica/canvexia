/**
 * Classifies a menu-item video URL so the player knows how to render it:
 *  - youtube/vimeo → lazy iframe embed (privacy-friendly, user-initiated play)
 *  - file          → native <video> (uploaded mp4/webm or a direct link)
 * Pure + testable.
 */
export type VideoSource =
  | { kind: "youtube" | "vimeo"; embedUrl: string }
  | { kind: "file"; url: string };

export function parseVideoSource(url: string): VideoSource {
  const yt =
    url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) {
    return { kind: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${yt[1]}` };
  }
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) {
    return { kind: "vimeo", embedUrl: `https://player.vimeo.com/video/${vimeo[1]}` };
  }
  return { kind: "file", url };
}

// ---------------------------------------------------------------------------
// Landing-page video (/create), configured by pasting a link in super-admin.
//
// Separate from parseVideoSource above because the policy differs on purpose:
// a menu video embeds through youtube-nocookie and never autoplays, whereas the
// landing video is only ever loaded AFTER the visitor taps play, so autoplay is
// what they asked for. Same parsing, different intent — hence the id extractors
// are shared and the embed builders are not.
// ---------------------------------------------------------------------------

/** The id out of any YouTube URL shape, or null. */
export function youtubeId(url: string): string | null {
  const m = url
    .trim()
    .match(
      /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|live\/|shorts\/)|youtu\.be\/)([\w-]{6,})/,
    );
  return m ? m[1] : null;
}

export function vimeoId(url: string): string | null {
  const m = url.trim().match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? m[1] : null;
}

/** A direct file we can hand to a <video> tag. */
export function isVideoFile(url: string): boolean {
  return /\.(mp4|webm|mov)(\?|$)/i.test(url.trim());
}

/**
 * The landing page's embed. Autoplay is correct here and nowhere else: this URL
 * is only ever built in response to a tap on the play button.
 */
export function toAutoplayEmbedUrl(url: string): string {
  const yt = youtubeId(url);
  if (yt) return `https://www.youtube.com/embed/${yt}?autoplay=1&rel=0&playsinline=1`;
  const vim = vimeoId(url);
  if (vim) return `https://player.vimeo.com/video/${vim}?autoplay=1`;
  return url.trim();
}

/**
 * A thumbnail derived from the link itself, so pasting a YouTube URL is
 * genuinely the only step — there's no second field asking for a poster image
 * nobody has to hand.
 *
 * `hqdefault` rather than `maxresdefault`: the high-res one 404s on plenty of
 * videos, and a broken poster is worse than a slightly soft one.
 */
export function autoPoster(url: string): string | null {
  const yt = youtubeId(url);
  return yt ? `https://img.youtube.com/vi/${yt}/hqdefault.jpg` : null;
}

/** Something we can actually render. Anything else is rejected on save. */
export function isSupportedVideoUrl(url: string): boolean {
  const v = url.trim();
  if (!v) return false;
  if (youtubeId(v) || vimeoId(v)) return true;
  // A self-hosted file still has to be a URL, not a stray string.
  return isVideoFile(v) && /^https?:\/\//i.test(v);
}
