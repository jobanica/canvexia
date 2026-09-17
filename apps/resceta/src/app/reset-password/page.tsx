"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PasswordField } from "@/components/PasswordField";

/**
 * Set a new password, having arrived from the emailed link.
 *
 * Supabase puts a recovery token in the URL FRAGMENT and the browser client
 * exchanges it for a session on load (`detectSessionInUrl`, on by default). A
 * fragment never reaches the server, which is the point: this page has to be a
 * client component, and the token is never in a request this app could log.
 *
 * THE SESSION IS CHECKED BEFORE THE FORM IS OFFERED. Without that, somebody
 * opening /reset-password directly — or returning to an expired link — types a
 * new password twice and is told "Auth session missing", which reads as the app
 * being broken rather than the link being old.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "ok" | "no-session">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    // A beat for the client to finish exchanging the fragment. Reading the
    // session synchronously on mount finds nothing and shows the expired-link
    // message to somebody whose link is fine.
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      setReady(data.session ? "ok" : "no-session");
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setReady("ok");
    });
    void check();
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Those two don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    setPending(true);
    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.updateUser({ password });
    if (authError) {
      setError("That link has expired. Ask for a new one.");
      setPending(false);
      return;
    }
    setDone(true);
    // Signed in already, by virtue of the recovery session — so the honest next
    // step is the dashboard, not the sign-in form they just came from.
    router.refresh();
    setTimeout(() => router.push("/"), 1200);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>
      </header>

      {ready === "checking" && <p className="text-sm text-slate-500">Checking your link…</p>}

      {ready === "no-session" && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          This link has expired or has already been used.
          <p className="mt-3">
            <Link href="/forgot-password" className="font-medium underline">
              Ask for a new one
            </Link>
          </p>
        </div>
      )}

      {ready === "ok" &&
        (done ? (
          <p className="rounded-md border border-green-300 bg-green-50 p-4 text-sm text-green-900">
            ✓ Password updated. Taking you to your pharmacy…
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <PasswordField
              label="New password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              autoFocus
              minLength={8}
              hint="At least 8 characters."
            />
            <PasswordField
              label="Confirm password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              minLength={8}
            />
            {error && (
              <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-900">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {pending ? "Saving…" : "Update password"}
            </button>
          </form>
        ))}
    </main>
  );
}
