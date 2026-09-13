"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * The sticky category strip above a menu.
 *
 * Shared by the customer's ordering site and the cashier's POS so the two can't
 * drift apart — a cashier who knows the online menu should not have to relearn
 * the till. It also means the fiddly parts (which tab is underlined, keeping it
 * scrolled into view) are solved once.
 *
 * `scrollRef` is what makes it work in both places. Online, the page itself
 * scrolls and the observer watches the viewport. In the POS the menu is a
 * scrolling column inside a modal, and an observer watching the viewport would
 * think every section was visible at once — so it watches that element instead.
 */

export interface TabCategory {
  id: string;
  name: string;
}

/** The DOM id of a category's section. Both sides must agree on this. */
export function categorySectionId(id: string): string {
  return `cat-${id}`;
}

export function CategoryTabs({
  categories,
  scrollRef,
  stickyOffset = 0,
  className = "",
}: {
  categories: TabCategory[];
  /** The scrolling element the sections live in. Omit when the page scrolls. */
  scrollRef?: RefObject<HTMLElement | null>;
  /** Height of whatever is pinned above the sections (search bar + this strip). */
  stickyOffset?: number;
  className?: string;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);

  // Keyed on the visible ids so it re-binds when a search filters the list.
  const ids = categories.map((c) => c.id).join(",");

  useEffect(() => {
    const list = ids ? ids.split(",") : [];
    if (list.length === 0) return;
    const root = scrollRef?.current ?? null;
    const nodes = list
      .map((id) => document.getElementById(categorySectionId(id)))
      .filter((n): n is HTMLElement => !!n);
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // The visible section nearest the top — the one you're actually reading.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) setActive(visible.target.id.replace(/^cat-/, ""));
      },
      // Watch the band just below the strip, so a heading scrolling under the
      // tabs hands over to the next one instead of staying underlined.
      { root, rootMargin: "-64px 0px -70% 0px", threshold: 0 },
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [ids, scrollRef]);

  // With more categories than fit, the underlined one has to be brought back
  // into view or it's underlined somewhere nobody can see.
  //
  // The strip is scrolled DIRECTLY rather than through scrollIntoView, which
  // walks up the ancestors and will happily scroll the menu column too — that
  // second smooth scroll cancelled the one a tab tap had just started, so
  // tapping a tab underlined the right category and then went nowhere.
  useEffect(() => {
    if (!active) return;
    const strip = stripRef.current;
    const tab = strip?.querySelector<HTMLElement>(`[data-cat="${CSS.escape(active)}"]`);
    if (!strip || !tab) return;
    const left = tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2;
    strip.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [active]);

  function jump(id: string) {
    setActive(id);
    const el = document.getElementById(categorySectionId(id));
    if (!el) return;

    const container = scrollRef?.current;
    if (!container) {
      // The page itself scrolls (the customer's ordering site).
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    // Inside a modal, scroll the column by hand. scrollIntoView targets the
    // nearest scrollable ancestor, which in a fixed overlay isn't reliably the
    // one holding the menu — and a #hash would move the page behind it.
    const top =
      el.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop -
      stickyOffset;
    container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }

  if (categories.length < 2) return null;

  return (
    <div
      className={`sticky top-0 z-20 border-b border-plum-ink/10 bg-white/95 backdrop-blur ${className}`}
    >
      <div
        ref={stripRef}
        className="flex gap-5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {categories.map((c, i) => {
          // Before any scrolling has happened, the first tab is the active one.
          const on = active ? active === c.id : i === 0;
          return (
            <button
              key={c.id}
              type="button"
              data-cat={c.id}
              onClick={() => jump(c.id)}
              className={`shrink-0 whitespace-nowrap border-b-2 py-3 text-sm font-bold transition-colors ${
                on
                  ? "border-plum-ink text-plum-ink"
                  : "border-transparent text-plum-ink/45 hover:text-plum-ink"
              }`}
            >
              {c.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
