import "server-only";

import { unstable_cache } from "next/cache";
import { systemDb } from "@/server/tenancy/scoped-db";
import { parseVideoSource } from "@/lib/video";

/**
 * The platform "course" / tutorials hub: a small tree of sections, each with a
 * list of videos (usually YouTube links). Managed by the super-admin and shown
 * publicly at tutorials.<root>. Stored as a JSON blob on the platform_settings
 * singleton (no dedicated table), read/written best-effort so a lagging column
 * never breaks the app.
 */
export interface TutorialVideo {
  id: string;
  title: string;
  url: string; // original video URL (YouTube/Vimeo/direct)
  description?: string;
}
export interface TutorialSection {
  id: string;
  title: string;
  videos: TutorialVideo[];
}
export interface TutorialsData {
  intro: string; // optional blurb shown under the title on the public page
  sections: TutorialSection[];
}

export function emptyTutorials(): TutorialsData {
  return { intro: "", sections: [] };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Coerce whatever is in the JSON column into a safe, well-shaped TutorialsData. */
export function normalizeTutorials(raw: unknown): TutorialsData {
  if (!raw || typeof raw !== "object") return emptyTutorials();
  const r = raw as Partial<TutorialsData>;
  const sections = Array.isArray(r.sections) ? r.sections : [];
  return {
    intro: str(r.intro, 500),
    sections: sections.slice(0, 100).map((s, si) => {
      const sec = (s ?? {}) as Partial<TutorialSection>;
      const videos = Array.isArray(sec.videos) ? sec.videos : [];
      return {
        id: str(sec.id, 60) || `s${si}`,
        title: str(sec.title, 160),
        videos: videos.slice(0, 200).map((v, vi) => {
          const vid = (v ?? {}) as Partial<TutorialVideo>;
          return {
            id: str(vid.id, 60) || `s${si}v${vi}`,
            title: str(vid.title, 200),
            url: str(vid.url, 500),
            description: str(vid.description, 1000) || undefined,
          };
        }),
      };
    }),
  };
}

/** Read the tutorials hub content. Best-effort — empty if the column lags. */
export async function getTutorials(): Promise<TutorialsData> {
  try {
    const row = await systemDb((tx) =>
      tx.platformSetting.findUnique({ where: { id: "platform" }, select: { tutorials: true } }),
    );
    return normalizeTutorials(row?.tutorials);
  } catch {
    return emptyTutorials();
  }
}

/** The embeddable player URL for a tutorial video (YouTube/Vimeo iframe, else the raw file). */
export function tutorialEmbed(url: string): { kind: "youtube" | "vimeo" | "file"; src: string } {
  const s = parseVideoSource(url);
  return s.kind === "file" ? { kind: "file", src: s.url } : { kind: s.kind, src: s.embedUrl };
}

/**
 * Whether there is anything to watch yet.
 *
 * Read on every admin page render to decide whether to offer the Tutorials
 * link at all — a permanent button that leads to "coming soon" teaches owners
 * the link is worthless, and they stop trying it. So it's cached: the answer
 * changes only when the super-admin edits the hub, which busts the tag.
 */
export const TUTORIALS_TAG = "tutorials-content";

export async function hasTutorials(): Promise<boolean> {
  const cached = unstable_cache(
    async () => {
      const { sections } = await getTutorials();
      return sections.some((s) => s.videos.length > 0);
    },
    [TUTORIALS_TAG],
    { revalidate: 600, tags: [TUTORIALS_TAG] },
  );
  try {
    return await cached();
  } catch {
    return false;
  }
}
