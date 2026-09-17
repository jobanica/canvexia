"use client";

import Link from "next/link";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Ask for a reset link.
 *
 * IN THE BROWSER, not a Server Action, matching the sign-in form: the address
 * goes straight to Supabase and never passes through a request body this app
 * logs, retries or serialises.
 *
 * `window.location.origin` rather than an environment variable. This app
 * deliberately builds no absolute URLs anywhere (see .env.example), and the
 * right destination is the host the person is standing on — which for a
 * pharmacy that later gets its own domain is the one they know.
 *
 * IT REPORTS SUCCESS EITHER WAY. "No account uses that address" turns this form
 * into a way to find out who is staff here.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const supabase = createSupabaseBrowserClient();
    try {
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } catch {
      /* ignore — still report success, for the reason above */
    }
    setSent(true);
    setPending(false);
  }

  return (
    <main className="app-shell flex min-h-screen w-full flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="mt-1 text-sm text-slate-300">
          We&apos;ll email you a link to set a new one.
        </p>
      </header>

      {sent ? (
        <div className="rounded-md border border-green-300 bg-green-50 p-4 text-sm text-green-900">
          If an account exists for that address, a reset link is on its way. Check the inbox and
          the spam folder.
          <p className="mt-3">
            <Link href="/login" className="font-medium underline">
              ← Back to sign in
            </Link>
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-200">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
              className="w-full rounded-md border border-white/15 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md brand-gradient px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {pending ? "Sending…" : "Send reset link"}
          </button>
          <p className="text-center">
            <Link href="/login" className="text-sm text-slate-500 underline">
              ← Back to sign in
            </Link>
          </p>
        </form>
      )}
    </div>
    </main>
  );
}
