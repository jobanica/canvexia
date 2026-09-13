"use client";

import { useCallback } from "react";
import { readUtmParams, withUtm } from "@/lib/utm";

/**
 * The one button on the page.
 *
 * It is a plain <a>, not a router push: the destination is a different page in
 * a different flow, and a hard navigation is both faster and more reliable
 * inside the Facebook in-app browser than a client-side transition.
 *
 * On tap it fires two fire-and-forget signals — our own funnel counter and the
 * Meta Pixel — then gets out of the way. Neither is awaited: a metric must
 * never sit between someone and the thing they just tapped.
 */

export const CTA_LABEL = "CREATE MY FREE PREVIEW →";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

/**
 * Records the click, then carries the ad tags onto the destination.
 *
 * The href in the markup is the plain `/build`, so the page can be served
 * statically from the CDN and the link works before any JavaScript runs. The
 * tags are appended here, at click time, from the URL the visitor actually
 * arrived on — no hydration mismatch, and nothing to compute during render.
 *
 * Attribution does not depend on this: the middleware already put the tags in a
 * cookie. This is the backup for browsers that partition or drop it.
 */
export function useCtaClick(href: string) {
  return useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      recordClick();
      try {
        const utm = readUtmParams(new URLSearchParams(window.location.search));
        if (utm) {
          const target = withUtm(href, utm);
          if (target !== href) {
            e.preventDefault();
            window.location.href = target;
          }
        }
      } catch {
        /* fall through to the plain href */
      }
    },
    [href],
  );
}

/** Fire-and-forget funnel signals. Never awaited, never blocking. */
function recordClick() {
  try {
    const body = JSON.stringify({ event: "cta" });
    // sendBeacon survives the page unloading under us — a normal fetch would be
    // cancelled by the navigation we're about to do.
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/landing-event", new Blob([body], { type: "application/json" }));
    } else {
      void fetch("/api/landing-event", {
        method: "POST",
        body,
        headers: { "content-type": "application/json" },
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* metrics are never worth a broken CTA */
  }
  try {
    window.fbq?.("track", "InitiateCheckout");
  } catch {
    /* pixel absent or blocked */
  }
}

export function Cta({
  href = "/build",
  className = "",
  label = CTA_LABEL,
}: {
  href?: string;
  className?: string;
  label?: string;
}) {
  const onClick = useCtaClick(href);
  return (
    <a
      href={href}
      onClick={onClick}
      // min-h-[56px] — comfortably above the 48px tap target the spec asks for,
      // because this is the only thing on the page anyone needs to hit.
      className={`inline-flex min-h-[56px] w-full items-center justify-center rounded-full bg-brand-gradient px-7 text-center text-base font-extrabold uppercase tracking-wide text-white shadow-lg shadow-brand-primary/20 transition active:scale-[0.98] sm:w-auto sm:text-lg ${className}`}
    >
      {label}
    </a>
  );
}

/** The reassurance line that goes under every CTA. */
export function CtaNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-sm text-plum-ink/50">{children}</p>;
}
