"use client";

import { useEffect, useState } from "react";
import { Cta } from "./Cta";

/**
 * The mobile bottom bar. It fills the gaps between the page's own CTAs and
 * yields whenever one of them is on screen — two identical buttons visible at
 * once reads as a broken page, not as extra encouragement.
 *
 * Watches every element marked `data-cta-anchor` so adding a section with a CTA
 * doesn't also require remembering to update a list of ids here.
 *
 * IntersectionObserver rather than a scroll handler: nothing runs per frame,
 * which matters on the slow in-app browser this page is really built for.
 */
export function StickyCta({ href = "/build" }: { href?: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-cta-anchor]"));
    if (targets.length === 0) return;

    // Visible when NO anchor CTA is on screen.
    const onScreen = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) onScreen.add(e.target);
          else onScreen.delete(e.target);
        }
        setShow(onScreen.size === 0);
      },
      { rootMargin: "-8px 0px -80px 0px" },
    );
    for (const t of targets) io.observe(t);
    return () => io.disconnect();
  }, []);

  return (
    <div
      aria-hidden={!show}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-plum-ink/10 bg-white/95 px-4 pt-3 backdrop-blur transition-transform duration-200 sm:hidden ${
        show ? "translate-y-0" : "pointer-events-none translate-y-full"
      }`}
      // The iOS home-indicator area — without this the button sits under it.
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <Cta href={href} />
    </div>
  );
}
