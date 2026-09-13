import { toEmbed } from "@/lib/partners/video";

/**
 * Renders the partner training video (YouTube / Vimeo / direct file / link).
 * Returns null when no video is configured.
 */
export function TrainingVideo({ url }: { url: string | null }) {
  const embed = toEmbed(url);
  if (!embed) return null;

  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
      <p className="text-sm font-semibold">▶ Partner training</p>
      <p className="mb-3 text-xs text-plum-ink/50">
        Watch this first — learn how Servd works so you can demo and sell it with confidence.
      </p>

      {embed.kind === "youtube" || embed.kind === "vimeo" ? (
        <div className="relative w-full overflow-hidden rounded-lg" style={{ paddingTop: "56.25%" }}>
          <iframe
            src={embed.src}
            title="Partner training video"
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : embed.kind === "file" ? (
        <video src={embed.src} controls className="w-full rounded-lg" />
      ) : (
        <a
          href={embed.src}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-full px-5 py-2 text-sm font-semibold btn-brand text-white"
        >
          Watch the training video ↗
        </a>
      )}
    </div>
  );
}
