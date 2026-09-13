"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startFeatureUnlock, verifyFeatureUnlock } from "@/server/billing/addon-actions";

/**
 * The upsell shown once an account has used its free table QR.
 *
 * Deliberately not a wall. Everything already set up keeps working, the counter
 * QR is untouched, and the card says so — an owner who thinks a payment screen
 * has taken their existing QR codes hostage doesn't buy, they complain.
 */
export function UnlockTablesCard({ price, pending }: { price: string; pending: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);
  const router = useRouter();

  async function go() {
    setBusy(true);
    setError(null);
    const res = await startFeatureUnlock("unlimitedTables");
    if ("checkoutUrl" in res) {
      window.location.href = res.checkoutUrl;
      return; // leaving the page — keep the button disabled
    }
    setError(res.error);
    setBusy(false);
  }

  // Safety net for a payment whose webhook never arrived: ask the gateway.
  async function verify() {
    setChecking(true);
    setCheckMsg(null);
    const res = await verifyFeatureUnlock("unlimitedTables");
    setChecking(false);
    if (res.unlocked) {
      router.refresh();
      return;
    }
    setCheckMsg(res.message);
  }

  return (
    <div className="rounded-tile border border-brand-primary/30 bg-brand-primary/5 p-4">
      <p className="font-heading font-bold text-plum-ink">
        📱 Unlock unlimited tables &amp; QR codes
      </p>
      <p className="mt-1 text-sm text-plum-ink/70">
        You&apos;ve used the free table QR that comes with every account. One payment of{" "}
        <strong>{price}</strong> adds as many tables and QR codes as you like — forever, on any
        plan.
      </p>
      <p className="mt-1 text-xs text-plum-ink/50">
        Your existing QR code and your counter QR keep working either way.
      </p>

      <div className="mt-3">
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
    </div>
  );
}
