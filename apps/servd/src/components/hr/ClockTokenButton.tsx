"use client";

import { useState } from "react";
import { clockByToken } from "@/server/hr/actions";

/** Public clock toggle reached by scanning a personal QR (/clock/[token]). */
export function ClockTokenButton({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; status?: "in" | "out"; name?: string; error?: string } | null>(null);

  async function handle() {
    setBusy(true);
    const res = await clockByToken(token);
    setBusy(false);
    setResult(res);
  }

  if (result?.ok && result.status) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-gradient text-3xl text-white">
          ✓
        </div>
        <p className="mt-4 font-heading text-xl font-bold">
          {result.name} clocked {result.status === "in" ? "IN" : "OUT"}
        </p>
        <p className="mt-1 text-sm text-plum-ink/50">{new Date().toLocaleTimeString()}</p>
      </div>
    );
  }

  return (
    <div className="text-center">
      <button
        onClick={handle}
        disabled={busy}
        className="rounded-full px-8 py-4 text-lg font-semibold btn-brand disabled:opacity-60"
      >
        {busy ? "…" : "Tap to clock in / out"}
      </button>
      {result?.error && <p className="mt-3 text-sm text-guava">{result.error}</p>}
    </div>
  );
}
