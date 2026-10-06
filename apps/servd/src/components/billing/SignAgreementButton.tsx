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
        onClick={() =>
          start(async () => {
            const r = await openSigningPage();
            if (r?.error) setError(r.error);
          })
        }
        className="rounded-lg px-4 py-2 font-semibold btn-brand disabled:opacity-60"
      >
        {pending ? "Opening…" : "Sign the subscription agreement"}
      </button>
      {error && <p className="mt-2 text-sm text-guava">{error}</p>}
    </div>
  );
}
