import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components — the sign-in form.
 *
 * persistSession + autoRefreshToken are spelled out because a pharmacy counter
 * sits open for a whole shift: the session has to survive a reload and keep
 * renewing itself rather than expiring and dumping the cashier back at /login
 * with a customer waiting.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: true, autoRefreshToken: true } },
  );
}
