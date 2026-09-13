import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components (login form, realtime subscriptions on
 * the kitchen/cashier screens later). Only ever uses the public anon key.
 *
 * persistSession + autoRefreshToken are spelled out because the merchant,
 * kitchen and cashier screens sit open for a whole shift: the session must
 * survive a reload and keep renewing itself in the background instead of
 * expiring and dumping staff back at /login.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    },
  );
}
