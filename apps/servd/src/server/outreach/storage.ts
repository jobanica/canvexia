import "server-only";

import { createSupabaseAdminClient, ensureBucket } from "@/lib/supabase/admin";

/**
 * Private storage for outreach videos. Everything is served via short-lived
 * signed URLs — the bucket is never public. The service-role client is used
 * server-side only (signed URL issuance + the worker).
 */
export const OUTREACH_BUCKET = "outreach-videos";

export const introPath = (videoId: string) => `intro/${videoId}`;
export const finalPath = (videoId: string) => `final/${videoId}.mp4`;

/** A signed URL the phone can PUT/upload the recording to, scoped to one path. */
export async function createIntroUploadUrl(videoId: string): Promise<{ bucket: string; path: string; token: string }> {
  const supabase = createSupabaseAdminClient();
  await ensureBucket(supabase, OUTREACH_BUCKET, false); // private
  const path = introPath(videoId);
  const { data, error } = await supabase.storage.from(OUTREACH_BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw new Error(`Could not create upload URL: ${error?.message ?? "unknown"}`);
  return { bucket: OUTREACH_BUCKET, path, token: data.token };
}

/** A short-lived signed URL to download a stored object (final MP4 or intro). */
export async function createDownloadUrl(path: string, expiresInSeconds = 900): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage.from(OUTREACH_BUCKET).createSignedUrl(path, expiresInSeconds, {
    download: true,
  });
  if (error || !data) return null;
  return data.signedUrl;
}
