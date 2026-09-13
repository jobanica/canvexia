import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient, ensureBucket } from "@/lib/supabase/admin";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
} from "@/lib/validation/menu";

export const MENU_BUCKET = "menu-images";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Validates and uploads a menu item image to Supabase Storage.
 *
 * - Type + size are validated SERVER-SIDE (never trust the client/file picker).
 * - The path is namespaced by restaurantId so one tenant's uploads can't collide
 *   with another's, and storage policies can isolate per restaurant.
 * - Returns the public URL to store on the menu item.
 *
 * Requires a public bucket named `menu-images` (create it in Supabase Storage).
 */
export async function uploadMenuImage(
  restaurantId: string,
  file: File,
): Promise<string> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as never)) {
    throw new Error("Unsupported image type. Use JPEG, PNG, or WebP.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image too large. Please use a photo under 4 MB.");
  }

  const supabase = createSupabaseAdminClient();
  await ensureBucket(supabase, MENU_BUCKET, true);
  const path = `${restaurantId}/${randomUUID()}.${EXT[file.type]}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(MENU_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabase.storage.from(MENU_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Uploads raw image bytes (e.g. an AI-generated menu photo) to the public menu
 * bucket and returns the public URL. Same namespacing as uploadMenuImage.
 */
export async function uploadMenuImageBytes(
  restaurantId: string,
  bytes: Uint8Array,
  ext = "png",
  contentType = "image/png",
): Promise<string> {
  const supabase = createSupabaseAdminClient();
  await ensureBucket(supabase, MENU_BUCKET, true);
  const path = `${restaurantId}/${randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(MENU_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  const { data } = supabase.storage.from(MENU_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
