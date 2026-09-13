"use server";

import { revalidatePath } from "next/cache";
import { requireOwnerAction } from "@/server/tenancy/require-admin";
import { systemDb } from "@/server/tenancy/scoped-db";
import { isSupportedVideoUrl } from "@/lib/video";
import { invalidateLandingConfig } from "./settings";

const PATH = "/super-admin/funnel";

export type LandingVideoState = { ok?: boolean; error?: string } | null;

/**
 * Set (or clear) the how-it-works video on the /create landing page.
 *
 * Validated before it's stored: a typo'd link would silently render an empty
 * black box on the page paid traffic lands on, and nobody would find out until
 * the ad spend had already gone.
 */
export async function saveLandingVideo(
  _prev: LandingVideoState,
  formData: FormData,
): Promise<LandingVideoState> {
  await requireOwnerAction();
  const url = String(formData.get("videoUrl") ?? "").trim();

  if (url && !isSupportedVideoUrl(url)) {
    return { error: "That doesn't look like a YouTube link. Paste the full URL from the address bar." };
  }
  if (url.length > 500) return { error: "That link is too long." };

  try {
    await systemDb((tx) =>
      tx.platformSetting.upsert({
        where: { id: "platform" },
        create: { id: "platform", landingVideoUrl: url || null },
        update: { landingVideoUrl: url || null },
        select: { id: true },
      }),
    );
  } catch {
    return { error: "Couldn't save. Run add-landing-attribution.sql, then retry." };
  }

  invalidateLandingConfig();
  revalidatePath(PATH);
  revalidatePath("/create");
  return { ok: true };
}
