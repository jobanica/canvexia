import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient, ensureBucket } from "@/lib/supabase/admin";

/**
 * Temp storage for AI menu-import uploads.
 *
 * Large files (multi-page PDFs, hi-res photos) can't go through a Server Action
 * — the serverless request body is capped at a few MB. Instead the browser
 * uploads straight to Supabase Storage using a short-lived SIGNED UPLOAD URL,
 * and the server later hands Claude a SIGNED READ URL so it fetches the file
 * itself. Files live in a private bucket and are deleted right after analysis.
 */

export const MENU_IMPORT_BUCKET = "menu-imports";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export type UploadTarget = { path: string; token: string };

/** One signed upload target per file type, namespaced under the restaurant. */
export async function createImportUploadTargets(
  restaurantId: string,
  types: string[],
): Promise<UploadTarget[]> {
  const supabase = createSupabaseAdminClient();
  await ensureBucket(supabase, MENU_IMPORT_BUCKET, false);

  const targets: UploadTarget[] = [];
  for (const type of types) {
    const ext = EXT[type] ?? "bin";
    const path = `${restaurantId}/${randomUUID()}.${ext}`;
    const { data, error } = await supabase.storage
      .from(MENU_IMPORT_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      throw new Error(error?.message ?? "Could not create an upload URL.");
    }
    targets.push({ path, token: data.token });
  }
  return targets;
}

/** Time-limited public URLs Anthropic can fetch (10 minutes is plenty). */
export async function signImportReadUrls(paths: string[]): Promise<string[]> {
  const supabase = createSupabaseAdminClient();
  const urls: string[] = [];
  for (const path of paths) {
    const { data, error } = await supabase.storage
      .from(MENU_IMPORT_BUCKET)
      .createSignedUrl(path, 600);
    if (error || !data) throw new Error(error?.message ?? "Could not read the upload.");
    urls.push(data.signedUrl);
  }
  return urls;
}

/** Best-effort cleanup of temp uploads after analysis. */
export async function removeImports(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    const supabase = createSupabaseAdminClient();
    await supabase.storage.from(MENU_IMPORT_BUCKET).remove(paths);
  } catch {
    /* leftover temp files expire harmlessly; ignore */
  }
}
