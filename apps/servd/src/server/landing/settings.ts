import "server-only";

import { unstable_cache, revalidateTag } from "next/cache";
import { systemDb } from "@/server/tenancy/scoped-db";
import { autoPoster } from "@/lib/video";

/**
 * What the /create landing page is configured to show.
 *
 * Read through a cache with an explicit tag rather than on every request: this
 * page is the destination for paid traffic, and a database round-trip in front
 * of the hero would be paid for in visitors. Saving from super-admin busts the
 * tag, so the change is live immediately without a deploy.
 */

const TAG = "landing-config";

export interface LandingConfig {
  videoUrl: string;
  /** Derived from the video URL — YouTube already has a thumbnail for it. */
  posterUrl: string;
}

async function readConfig(): Promise<LandingConfig> {
  // The env var stays as a fallback so an existing deployment that set it
  // doesn't lose its video the moment this ships.
  let videoUrl = process.env.NEXT_PUBLIC_CREATE_VIDEO_URL ?? "";
  try {
    const row = await systemDb((tx) =>
      tx.platformSetting.findUnique({
        where: { id: "platform" },
        select: { landingVideoUrl: true },
      }),
    );
    if (row?.landingVideoUrl) videoUrl = row.landingVideoUrl;
  } catch {
    /* column not migrated yet — fall back to the env var */
  }
  const poster = process.env.NEXT_PUBLIC_CREATE_VIDEO_POSTER || autoPoster(videoUrl) || "";
  return { videoUrl, posterUrl: poster };
}

export async function getLandingConfig(): Promise<LandingConfig> {
  const cached = unstable_cache(readConfig, [TAG], { revalidate: 3600, tags: [TAG] });
  try {
    return await cached();
  } catch {
    return { videoUrl: "", posterUrl: "" };
  }
}

/** Called after a save so the landing page picks the change up at once. */
export function invalidateLandingConfig(): void {
  try {
    revalidateTag(TAG);
  } catch {
    /* outside a request scope — the hourly revalidate still catches it */
  }
}
