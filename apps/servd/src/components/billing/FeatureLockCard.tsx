import Link from "next/link";
import { formatPeso } from "@/lib/money";
import type { FeatureLock } from "@/server/billing/feature-lock";
import { UnlockFeatureButton } from "./UnlockFeatureButton";

/**
 * The locked screen. One feature, one price, one button.
 *
 * This replaces "this is locked — go to Billing", which sent an owner who
 * wanted ONE thing to a page listing eighteen paid features. That page reads as
 * a bill rather than an offer, and the reliable outcome is a closed tab. Here
 * they see the thing they just tried to open, what it costs, and a button —
 * and the catalogue is a quiet link at the bottom for anyone who wants it.
 *
 * Deliberately not a "you're missing out" pitch. The owner is standing on the
 * page they meant to use; they don't need persuading that they want it.
 */
export function FeatureLockCard({
  lock,
  title,
  backHref = "/admin",
  backLabel = "← Dashboard",
}: {
  lock: FeatureLock;
  /** Page heading, so the screen still says what it is. */
  title: string;
  backHref?: string;
  backLabel?: string;
}) {
  const price = formatPeso(lock.price);

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <Link href={backHref} className="text-sm text-plum-ink/50">
          {backLabel}
        </Link>
        <h1 className="font-heading text-2xl font-bold">{title}</h1>
      </div>

      <div className="rounded-tile border border-plum-ink/10 bg-white p-6">
        <div className="flex items-start gap-3">
          <span className="text-2xl" aria-hidden>
            🔒
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-lg font-bold text-plum-ink">{lock.label} is locked</h2>
            <p className="mt-1 text-sm text-plum-ink/70">{lock.blurb}</p>

            {lock.sellable ? (
              <div className="mt-4 rounded-lg border border-brand-primary/40 bg-cream/40 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-plum-ink/45">One-time</p>
                <p className="font-heading text-2xl font-extrabold text-plum-ink">{price}</p>
                <p className="mt-1 text-xs text-plum-ink/60">
                  Pay once and it&apos;s yours for good — no monthly fee, and it stays yours
                  whatever plan you&apos;re on later.
                </p>
                <div className="mt-3">
                  <UnlockFeatureButton
                    feature={lock.feature}
                    price={price}
                    pending={lock.pending}
                  />
                </div>
                {lock.pending && (
                  <p className="mt-2 text-xs text-plum-ink/50">
                    A checkout was already started. If you&apos;ve paid, it unlocks here within a
                    minute.
                  </p>
                )}
              </div>
            ) : (
              // Not sold as a one-time unlock — metered (SMS burns credits per
              // text) or billed monthly. Saying so beats a button that can't work.
              <div className="mt-4 rounded-lg border border-plum-ink/10 bg-cream/40 p-4">
                <p className="text-sm text-plum-ink/70">
                  This one isn&apos;t sold as a one-time unlock. See the options on the billing
                  page.
                </p>
                <Link
                  href="/admin/billing"
                  className="mt-3 inline-block rounded-full border border-plum-ink/20 px-5 py-2.5 text-sm font-semibold text-plum-ink"
                >
                  See options →
                </Link>
              </div>
            )}

            {lock.sellable && (
              <p className="mt-3 text-xs text-plum-ink/45">
                Unlocking several things at once?{" "}
                <Link href="/admin/billing" className="font-semibold text-brand-primary">
                  See everything available
                </Link>
                .
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
