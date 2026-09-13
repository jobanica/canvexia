/**
 * The "Powered by Servd" line at the foot of a customer-facing page.
 *
 * Deliberately quiet: a small grey line below the restaurant's own content,
 * after everything a diner came to the page to do. It is the shop's storefront,
 * not Servd's — the badge earns its place by being findable, not by competing
 * with the menu.
 *
 * A plain server component, no state and no client bundle. It renders only
 * where the branding rules say it should; the decision lives in
 * lib/branding/powered-by.ts, never here.
 */
export function PoweredByServd({ className = "" }: { className?: string }) {
  return (
    <div className={`px-4 py-6 text-center ${className}`}>
      <a
        href="https://www.servdph.com"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex flex-col items-center gap-1 opacity-60 transition hover:opacity-100"
      >
        <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-current">
          Powered by
        </span>
        <span className="flex items-center gap-1.5">
          {/* Static Servd mark — independent of the restaurant's own colours. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/servd-icon.svg" alt="" width={18} height={18} className="rounded-[5px]" aria-hidden />
          <span className="font-heading text-base font-extrabold tracking-tight text-current">servd</span>
        </span>
        <span className="text-[11px] font-medium tracking-wide text-current">www.servdph.com</span>
      </a>
    </div>
  );
}
