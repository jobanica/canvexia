"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppIcon, Wordmark } from "@/components/Wordmark";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "ok" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Establish the recovery session from the email link (PKCE ?code or hash token).
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }
        const { data } = await supabase.auth.getSession();
        setReady(data.session ? "ok" : "invalid");
      } catch {
        setReady("invalid");
      }
    })();
  }, []);

  async function submit() {
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(error.message || "Couldn't update password.");
    } else {
      setDone(true);
      // Return to where the reset was requested from (e.g. /partner/login).
      let next = "/login";
      try {
        const n = new URL(window.location.href).searchParams.get("next");
        if (n && n.startsWith("/")) next = n; // only same-origin paths
      } catch {
        /* keep default */
      }
      setTimeout(() => router.push(next), 1500);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-6 pt-16">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <AppIcon size={32} />
        <Wordmark size="1.4rem" />
      </Link>
      <h1 className="font-heading text-2xl font-bold">Set a new password</h1>

      {ready === "checking" && <p className="mt-4 text-sm text-plum-ink/50">Verifying your link…</p>}

      {ready === "invalid" && (
        <div className="mt-4 rounded-lg border border-guava/30 bg-guava/5 p-4 text-sm text-plum-ink/75">
          This reset link is invalid or has expired.
          <div className="mt-3">
            <Link href="/forgot-password" className="font-semibold text-brand-primary">Request a new link</Link>
          </div>
        </div>
      )}

      {ready === "ok" && (
        done ? (
          <p className="mt-4 text-sm font-semibold text-mango">✓ Password updated. Redirecting to sign in…</p>
        ) : (
          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium">New password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium">Confirm password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2" />
            </div>
            {error && <p className="text-sm text-guava">{error}</p>}
            <button onClick={submit} disabled={busy} className="w-full rounded-lg py-2.5 font-semibold btn-brand disabled:opacity-60">
              {busy ? "Saving…" : "Update password"}
            </button>
          </div>
        )
      )}
    </div>
  );
}
