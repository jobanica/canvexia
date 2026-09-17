import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient, ensureBucket } from "@/lib/supabase/admin";

/**
 * A partner's logo. PUBLIC, unlike everything else a partner uploads.
 *
 * It is meant to be seen: it goes on the storefronts and receipts their
 * merchants put in front of diners. A signed URL would expire in the middle of
 * somebody's lunch order.
 *
 * `brandConfig.logoUrl` was a paste-a-URL box, which meant a partner had to
 * find their own hosting first — so in practice the field stayed empty and the
 * white-label was theoretical.
 */
export const BRAND_BUCKET = "partner-brand";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
const MAX_BYTES = 2 * 1024 * 1024;

export async function uploadPartnerLogo(partnerId: string, file: File): Promise<string> {
  const ext = EXT[file.type];
  if (!ext) throw new Error("Use a PNG, JPEG, WebP or SVG.");
  if (file.size > MAX_BYTES) throw new Error("Keep the logo under 2 MB.");

  const supabase = createSupabaseAdminClient();
  await ensureBucket(supabase, BRAND_BUCKET, true);
  const path = `${partnerId}/${randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(BRAND_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: false,
    });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BRAND_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
