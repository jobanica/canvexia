"use client";

import { useState } from "react";
import { payNow } from "@/server/billing/portal-actions";

export function PayNowButton({ label = "Add payment method & pay" }: { label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setBusy(true);
    setError(null);
    const res = await payNow();
    if (res.ok && res.checkoutUrl) {
      window.location.href = res.checkoutUrl;
    } else {
      setBusy(false);
      setError(res.error ?? "Couldn't start checkout.");
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={handle}
        disabled={busy}
        className="rounded-full px-5 py-2 text-sm font-semibold btn-brand disabled:opacity-60"
      >
        {busy ? "Starting…" : label}
      </button>
      {error && <span className="text-xs text-guava">{error}</span>}
    </span>
  );
}
