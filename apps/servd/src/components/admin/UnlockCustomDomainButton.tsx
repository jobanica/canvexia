"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startCustomDomainUnlock, verifyCustomDomainUnlock } from "@/server/billing/addon-actions";

/** Sends the owner to the hosted checkout for the one-time custom-domain unlock. */
export function UnlockCustomDomainButton({ price, pending = false }: { price: string; pending?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);
  const router = useRouter();

  // Safety net for a payment whose webhook never arrived: ask the gateway.
  async function verify() {
    setChecking(true);
    setCheckMsg(null);
    const res = await verifyCustomDomainUnlock();
    setChecking(false);
    if (res.unlocked) {
      router.refresh();
      return;
    }
    setCheckMsg(res.message);
  }

  async function go() {
    setBusy(true);
    setError(null);
    const res = await startCustomDomainUnlock();
    if ("checkoutUrl" in res) {
      window.location.href = res.checkoutUrl;
      return; // leaving the page — keep the button disabled
    }
    setError(res.error);
    setBusy(false);
  }

  return (
    <div>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="rounded-full px-5 py-2.5 text-sm font-semibold btn-brand disabled:opacity-50"
      >
        {busy ? "Opening checkout…" : `Unlock for ${price}`}
      </button>
      {error && <p className="mt-2 text-sm text-guava">{error}</p>}

      {pending && (
        <div className="mt-2">
          <button
            type="button"
            onClick={verify}
            disabled={checking}
            className="text-xs font-semibold text-brand-primary underline disabled:opacity-50"
          >
            {checking ? "Checking your payment…" : "Already paid? Check now"}
          </button>
          {checkMsg && <p className="mt-1 text-xs text-plum-ink/60">{checkMsg}</p>}
        </div>
      )}
    </div>
  );
}
