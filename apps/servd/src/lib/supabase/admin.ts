import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. SERVER-ONLY — it bypasses RLS and storage
 * policies, so it must NEVER be imported into a Client Component. We use it for
 * trusted server tasks like uploading menu images to a namespaced storage path.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Ensures a Storage bucket exists (creating it if missing) so uploads don't fail
 * with "Bucket not found" on a fresh project. Requires the service-role client.
 */
export async function ensureBucket(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  name: string,
  isPublic: boolean,
): Promise<void> {
  const { data } = await supabase.storage.getBucket(name);
  if (data) return;
  const { error } = await supabase.storage.createBucket(name, { public: isPublic });
  // Ignore races where it was created concurrently.
  if (error && !/already exists|exists/i.test(error.message)) {
    throw new Error(`Could not create bucket "${name}": ${error.message}`);
  }
}
