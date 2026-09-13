"use client";

import { useState } from "react";
import Link from "next/link";
import { WebOrder, type WebOrderProps } from "@/components/site/WebOrder";
import { requestActivation } from "@/server/build/activate-action";

/**
 * The owner's own storefront, rendered with the REAL ordering component — same
 * layout, same cart, same checkout screens a paying restaurant gets. The only
 * difference is the last tap: instead of creating an order it opens the
 * activation prompt.
 *
 * `isOwner` is false when someone opens the shared preview link on another
 * device (a business partner, say). They still get the full experience; they
 * just see "ask the owner to activate" instead of the payment button.
 */
export function PreviewStorefront({
  order,
  isOwner,
  buildHref,
}: {
  order: WebOrderProps;
  isOwner: boolean;
  buildHref: string;
}) {
  const [prompt, setPrompt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function activate() {
    setBusy(true);
    setError(null);
    const res = await requestActivation();
    if (res.ok) {
      window.location.href = res.checkoutUrl;
    } else {
      setBusy(false);
      setError(res.error);
    }
  }

  return (
    <>
      {/* Persistent, tasteful reminder that this isn't live yet. */}
      <div className="sticky top-0 z-40 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-plum-ink px-4 py-2 text-center text-xs font-semibold text-white sm:text-sm">
        <span>Preview mode · This is how your customers will order</span>
        {isOwner && (
          <button
            onClick={() => setPrompt(true)}
            className="rounded-full bg-white px-3 py-1 text-xs font-bold text-plum-ink"
          >
            Activate
          </button>
        )}
      </div>

      <WebOrder {...order} demo onDemoOrder={() => setPrompt(true)} />

      {prompt && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
          onClick={() => !busy && setPrompt(false)}
        >
          <div
            className="w-full max-w-sm rounded-t-tile bg-white p-6 text-center sm:rounded-tile"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-4xl">🎉</div>
            <h2 className="mt-3 font-heading text-xl font-bold text-plum-ink">
              This is a preview!
            </h2>
            <p className="mt-2 text-sm text-plum-ink/60">
              Orders won&apos;t reach your kitchen yet. Activate your restaurant to start accepting
              real orders, take payments, and get your dashboard.
            </p>

            {isOwner ? (
              <>
                <button
                  onClick={activate}
                  disabled={busy}
                  className="mt-5 w-full rounded-full py-3.5 font-heading text-base font-bold btn-brand disabled:opacity-60"
                >
                  {busy ? "Opening payment…" : "Activate for ₱499"}
                </button>
                {error && <p className="mt-2 text-sm text-guava">{error}</p>}
                <Link
                  href={buildHref}
                  className="mt-3 block text-xs font-semibold text-plum-ink/50 underline"
                >
                  Keep editing my menu
                </Link>
              </>
            ) : (
              <p className="mt-5 rounded-xl bg-cream/70 px-3 py-3 text-sm text-plum-ink/70">
                This restaurant is still setting up. Ask the owner to activate it to start taking
                orders.
              </p>
            )}

            <button
              onClick={() => !busy && setPrompt(false)}
              className="mt-4 text-xs font-semibold text-plum-ink/40"
            >
              Keep looking around
            </button>
          </div>
        </div>
      )}
    </>
  );
}
