"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startFeatureSubscription, verifyFeatureSubscription } from "@/server/billing/addon-actions";

/** Locked screen for the ₱499/mo content scheduler — pay month one to open it. */
export function SubscribeScheduler({ price, pending }: { price: string; pending: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);
  const router = useRouter();

  async function subscribe() {
    setBusy(true);
    setError(null);
    const res = await startFeatureSubscription("contentScheduler");
    if ("checkoutUrl" in res) {
      window.location.href = res.checkoutUrl;
      return;
    }
    setBusy(false);
    setError(res.error);
  }

  async function verify() {
    setChecking(true);
    setCheckMsg(null);
    const res = await verifyFeatureSubscription("contentScheduler");
    setChecking(false);
    if (res.unlocked) {
      router.refresh();
      return;
    }
    setCheckMsg(res.message);
  }

  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-6">
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>🔒</span>
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-bold text-plum-ink">Content scheduler is locked</h2>
          <p className="mt-1 text-sm text-plum-ink/70">
            Write once and post to Facebook, Instagram, TikTok and more — now, or scheduled for
            later. Keep your socials busy without opening five apps.
          </p>

          <div className="mt-4 rounded-lg border border-brand-primary/40 bg-cream/40 p-4">
            <p className="font-heading text-2xl font-extrabold text-plum-ink">
              {price}<span className="text-base font-bold text-plum-ink/50">/month</span>
            </p>
            <p className="mt-1 text-xs text-plum-ink/60">
              Billed monthly, separate from your plan. Pay the first month to unlock it — cancel any
              time and it stays on until the month you paid for runs out.
            </p>
            <button
              type="button"
              onClick={subscribe}
              disabled={busy}
              className="mt-3 rounded-full px-5 py-2.5 text-sm font-semibold btn-brand disabled:opacity-50"
            >
              {busy ? "Opening checkout…" : `Subscribe — ${price}/month`}
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

          <p className="mt-3 text-xs text-plum-ink/45">
            Not included in any plan or free trial — it carries a real per-post cost, so it&apos;s
            billed on its own.
          </p>
        </div>
      </div>
    </div>
  );
}
