"use client";

import { useEffect, useState } from "react";
import { ApplyButton } from "./ApplyButton";

/** The id the hero renders at its foot, so this knows when it has scrolled by. */
export const HERO_SENTINEL_ID = "hero-end";

/**
 * On a phone, the one action follows you down the page once the hero's own
 * button has scrolled out of reach. Hidden from `sm` up, where the page is
 * short enough that it is never far away.
 *
 * Watches the hero's sentinel; if that is somehow missing, falls back to a
 * scroll distance so the button still appears rather than never showing.
 */
export function StickyApply() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const sentinel = document.getElementById(HERO_SENTINEL_ID);
    if (sentinel && "IntersectionObserver" in window) {
      const observer = new IntersectionObserver(([entry]) => setShow(entry.boundingClientRect.top < 0), {
        threshold: 0,
      });
      observer.observe(sentinel);
      return () => observer.disconnect();
    }
    const onScroll = () => setShow(window.scrollY > 400);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:hidden">
      <ApplyButton position="sticky" className="w-full" />
    </div>
  );
}
