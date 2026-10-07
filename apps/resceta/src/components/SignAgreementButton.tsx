"use client";

import { useState, useTransition } from "react";
import { openSigningPage } from "@/server/agent-portal/contract-actions";

export function SignAgreementButton() {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => {
          const r = await openSigningPage();
          if (r?.error) setError(r.error);
        })}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {pending ? "Opening…" : "Sign the subscription agreement"}
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
