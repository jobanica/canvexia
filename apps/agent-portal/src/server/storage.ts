import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Private file storage: receipts now, signatures and contract PDFs in Phase 4.
 *
 * One private Supabase Storage bucket, reached only with the service role.
 * Nothing in it is ever public; a person sees a file through a signed URL that
 * expires in minutes, minted after the page has checked they may see it.
 *
 * Create the bucket once in Supabase → Storage: name `agent-portal-private`,
 * Public OFF.
 */
export const PRIVATE_BUCKET = "agent-portal-private";

export async function putPrivateObject(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const { error } = await createSupabaseAdminClient()
    .storage.from(PRIVATE_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
}

/** A short-lived link to a private file. Five minutes by default. */
export async function signedUrl(path: string, expiresInSeconds = 300): Promise<string | null> {
  const { data, error } = await createSupabaseAdminClient()
    .storage.from(PRIVATE_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  return error ? null : data.signedUrl;
}
