import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. SERVER-ONLY — it bypasses RLS and storage
 * policies, so it must NEVER be imported into a Client Component.
 *
 * Used for one thing here: creating the Auth user behind a staff invite. That
 * genuinely needs admin rights, and nothing else in this app does.
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
