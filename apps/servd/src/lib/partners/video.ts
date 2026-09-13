/**
 * Normalise a training-video URL into something embeddable. Pure + testable.
 * Supports YouTube (watch / youtu.be / shorts / embed), Vimeo, and direct video
 * files; anything else falls back to a plain link.
 */

export type EmbedKind = "youtube" | "vimeo" | "file" | "link";
export interface EmbedInfo {
  kind: EmbedKind;
  src: string; // iframe src (youtube/vimeo), file url, or the original link
}

function youtubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

export function toEmbed(rawUrl: string | null | undefined): EmbedInfo | null {
  const url = (rawUrl ?? "").trim();
  if (!url) return null;

  const yt = youtubeId(url);
  if (yt) return { kind: "youtube", src: `https://www.youtube.com/embed/${yt}` };

  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return { kind: "vimeo", src: `https://player.vimeo.com/video/${vimeo[1]}` };

  if (/\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url)) return { kind: "file", src: url };

  return { kind: "link", src: url };
}
