import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient, ensureBucket } from "@/lib/supabase/admin";
import { ALLOWED_VIDEO_TYPES, MAX_VIDEO_BYTES } from "@/lib/validation/menu";

export const VIDEO_BUCKET = "menu-videos";

const EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
};

/**
 * Validates + uploads a short menu video to Supabase Storage. Same pattern as
 * menu images: type + size validated server-side, path namespaced per tenant.
 * Requires a public bucket named `menu-videos`.
 */
export async function uploadMenuVideo(
  restaurantId: string,
  file: File,
): Promise<string> {
  if (!ALLOWED_VIDEO_TYPES.includes(file.type as never)) {
    throw new Error("Unsupported video type. Use MP4 or WebM.");
  }
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error("Video too large. Max 50 MB.");
  }

  const supabase = createSupabaseAdminClient();
  await ensureBucket(supabase, VIDEO_BUCKET, true);
  const path = `${restaurantId}/${randomUUID()}.${EXT[file.type]}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(VIDEO_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabase.storage.from(VIDEO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
