import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient, ensureBucket } from "@/lib/supabase/admin";

export const CLOCK_BUCKET = "clock-photos";
const MAX_BYTES = 4 * 1024 * 1024; // ~4 MB after JPEG compression

/**
 * Uploads a clock-in/out selfie (data URL) to a PRIVATE bucket, namespaced by
 * restaurant + employee. Returns the storage PATH (serve via signed URL).
 */
export async function uploadClockPhoto(
  restaurantId: string,
  employeeId: string,
  dataUrl: string,
): Promise<string> {
  const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) throw new Error("Invalid photo.");
  const contentType = m[1];
  const buffer = Buffer.from(m[2], "base64");
  if (buffer.length > MAX_BYTES) throw new Error("Photo too large.");
  const ext = contentType.split("/")[1].replace("jpeg", "jpg");

  const supabase = createSupabaseAdminClient();
  await ensureBucket(supabase, CLOCK_BUCKET, false);
  const path = `${restaurantId}/${employeeId}/${randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(CLOCK_BUCKET)
    .upload(path, buffer, { contentType, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

/** Signed URL for viewing a stored clock photo (admin/manager). */
export async function signClockPhoto(path: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.storage
    .from(CLOCK_BUCKET)
    .createSignedUrl(path, 60 * 10); // 10 minutes
  return data?.signedUrl ?? null;
}
