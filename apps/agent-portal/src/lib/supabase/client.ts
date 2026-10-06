import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components — the sign-in form.
 *
 * persistSession + autoRefreshToken are spelled out because an agent signs in
 * once on their phone and expects to stay signed in: the session has to
 * survive a reload and keep renewing itself.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: true, autoRefreshToken: true } },
  );
}
