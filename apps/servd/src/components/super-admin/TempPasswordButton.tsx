"use client";

import { useState } from "react";
import { resetOwnerPassword } from "@/server/billing/super-admin-actions";

/**
 * Generates a fresh temporary password for a restaurant owner's login and shows
 * the handoff details (login + new password). Guarded by a confirm — it
 * invalidates the owner's current password.
 */
export function TempPasswordButton({ restaurantId, className }: { restaurantId: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ login: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!confirm("Generate a NEW temporary password for this owner? Their current password will stop working.")) return;
    setBusy(true);
    setError(null);
    const res = await resetOwnerPassword(restaurantId);
    setBusy(false);
    if (res.ok) setResult({ login: res.login, password: res.password });
    else setError(res.error);
  }

  if (result) {
    return (
      <div className="rounded-lg border border-mango/40 bg-mango/10 p-2 text-xs">
        <p className="font-semibold text-plum-ink">New temporary password — hand these over:</p>
        <p className="mt-1">Login: <span className="font-mono font-semibold">{result.login}</span></p>
        <p>Password: <span className="font-mono font-semibold">{result.password}</span></p>
        <p className="mt-1 text-plum-ink/50">Tell them to change it after signing in.</p>
        <button onClick={() => setResult(null)} className="mt-1 text-plum-ink/50 underline">done</button>
      </div>
    );
  }

  return (
    <div>
      <button type="button" onClick={run} disabled={busy} className={className}>
        {busy ? "Generating…" : "🔑 Temp password"}
      </button>
      {error && <p className="mt-1 text-[11px] text-guava">{error}</p>}
    </div>
  );
}
