import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { introPath } from "@/server/outreach/storage";

/**
 * Kick off rendering for a recorded outreach video.
 *
 * If a render worker is configured (WORKER_URL + WORKER_SHARED_SECRET), we hand
 * the job to it — it stitches the personalized intro with the pre-baked tail and
 * flips the row to `ready` itself.
 *
 * If no worker is configured, we fall back gracefully: the personalized intro IS
 * the deliverable, so we mark it `ready` with the intro as the final file. That
 * keeps the whole super-admin flow working end-to-end today; deploy the worker
 * later to get the stitched intro+tail output with zero app changes.
 */
export async function triggerRender(videoId: string): Promise<void> {
  const workerUrl = process.env.WORKER_URL;
  const secret = process.env.WORKER_SHARED_SECRET;

  if (workerUrl && secret) {
    try {
      const res = await fetch(`${workerUrl.replace(/\/$/, "")}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-worker-secret": secret },
        body: JSON.stringify({ video_id: videoId }),
      });
      if (res.ok) return; // worker will flip status → ready / failed
      // fall through to the no-worker fallback on a bad response
    } catch {
      /* worker unreachable — fall back below */
    }
  }

  // No worker (or it failed to accept): finalize with the raw personalized clip.
  await systemDb((tx) =>
    tx.outreachVideo.updateMany({
      where: { id: videoId },
      data: { status: "ready", finalPath: introPath(videoId), errorMessage: null },
    }),
  );
}
