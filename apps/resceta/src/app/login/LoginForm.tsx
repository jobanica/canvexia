"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PasswordField } from "@/components/PasswordField";

/**
 * Sign in.
 *
 * The password goes straight from this form to Supabase Auth over the browser
 * client — it never passes through a Server Action, so it is never in a request
 * body this app logs, retries or serialises. Supabase sets the session cookie;
 * from that point the server resolves identity itself in `getCurrentStaff()`.
 *
 * `router.refresh()` before `push` is load-bearing: the destination is a Server
 * Component that reads the session, and without the refresh it renders from a
 * cache taken while nobody was signed in — a successful login that lands on a
 * "please sign in" page.
 */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) {
      // Deliberately not "no such user" vs "wrong password". Which one it is
      // tells an attacker whether an address is staff here.
      setError("That email and password don't match.");
      setPending(false);
      return;
    }

    router.refresh();
    router.push(next);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="username"
          autoFocus
          className="w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      <div>
        <PasswordField label="Password" value={password} onChange={setPassword} />
        {/*
          THE WAY BACK IN. There was none: no toggle, no link, and no reset
          route — so a forgotten password meant finding whoever holds the
          service-role key and running the staff CLI.
        */}
        <p className="mt-1 text-right">
          <Link href="/forgot-password" className="text-xs font-medium text-slate-600 underline">
            Forgot password?
          </Link>
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-900"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
