import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient, ensureBucket } from "@/lib/supabase/admin";

export const FIELD_BUCKET = "partner-attendance";
const MAX_BYTES = 4 * 1024 * 1024; // ~4 MB after the browser's JPEG compression

/**
 * A check-in selfie or a visit photo, into a PRIVATE bucket.
 *
 * Private, and returns the storage PATH rather than a URL. These are photographs
 * of employees, taken at work, with a timestamp and a location beside them —
 * the most sensitive thing A7 stores. A public URL is a permanent, guessable,
 * un-revocable copy; a path is read back through a short signed URL by somebody
 * the permission check has already let in.
 *
 * Namespaced by partner and seat so a bucket listing cannot be walked across
 * partners, and by a random id so two photos in the same minute cannot collide.
 */
export async function uploadFieldPhoto(
  partnerId: string,
  partnerUserId: string,
  dataUrl: string,
): Promise<string> {
  const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) throw new Error("Invalid photo.");
  const contentType = m[1];
  const buffer = Buffer.from(m[2], "base64");
  if (buffer.length > MAX_BYTES) throw new Error("Photo too large.");
  const ext = contentType.split("/")[1].replace("jpeg", "jpg");

  const supabase = createSupabaseAdminClient();
  await ensureBucket(supabase, FIELD_BUCKET, false);
  const path = `${partnerId}/${partnerUserId}/${randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(FIELD_BUCKET)
    .upload(path, buffer, { contentType, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

/**
 * A short-lived signed URL for one stored photo.
 *
 * TEN MINUTES, which is long enough to look at a page and short enough that a
 * link pasted into a chat stops working before it is forwarded anywhere.
 *
 * The PATH is checked against the partner before signing. Without that, a path
 * read out of one partner's row could be signed by another partner's session —
 * the bucket does not know about tenancy and this is the only place that can.
 */
export async function signFieldPhoto(
  partnerId: string,
  path: string | null,
): Promise<string | null> {
  if (!path) return null;
  if (!path.startsWith(`${partnerId}/`)) return null;
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.storage
    .from(FIELD_BUCKET)
    .createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}
