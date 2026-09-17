"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export interface NavLink {
  href: string;
  label: string;
  group: string;
}

/**
 * The nav, as a drawer behind a hamburger.
 *
 * WHY IT STOPPED BEING A ROW. Resceta shipped with eight links across the top
 * and grew to fourteen. A horizontal row wraps onto three lines on a counter
 * screen and scrolls off the right on a phone — and the links that fall off are
 * the ones added most recently, which are the ones nobody has found yet. The
 * same defect the HQ and partner shells had, and the same fix.
 *
 * CLOSES ON EVERY EXIT: the backdrop, Escape, a route change, and any click
 * that bubbles out of the panel. The last one covers a link to the page you are
 * already on, which changes no route and would otherwise leave the drawer open
 * over the thing it was asked to show.
 */
export function NavDrawer({ links, footer }: { links: NavLink[]; footer?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    // A drawer over a scrolling page scrolls the page behind it, which on a
    // phone reads as the drawer being broken.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const groups = links.reduce<Record<string, NavLink[]>>((acc, l) => {
    (acc[l.group] ??= []).push(l);
    return acc;
  }, {});

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium hover:border-slate-400"
      >
        <span aria-hidden>☰</span> Menu
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          {/*
            The bubbled click is the point: a link to the current page changes
            no route, so `usePathname` never fires and only this closes it.
          */}
          <nav
            className="relative flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto bg-white shadow-xl"
            onClick={() => setOpen(false)}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <span className="font-semibold tracking-tight">Resceta</span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="text-xl leading-none text-slate-400 hover:text-slate-900"
              >
                ×
              </button>
            </div>

            <div className="flex-1 px-3 py-3">
              {Object.entries(groups).map(([group, items]) => (
                <div key={group} className="mb-4">
                  <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {group}
                  </p>
                  {items.map((l) => {
                    const active = pathname === l.href;
                    return (
                      <Link
                        key={l.href}
                        href={l.href}
                        className={`block rounded-lg px-2 py-2 text-sm ${
                          active
                            ? "bg-slate-900 font-medium text-white"
                            : "text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {l.label}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>

            {footer && <div className="border-t border-slate-200 px-5 py-4">{footer}</div>}
          </nav>
        </div>
      )}
    </>
  );
}
