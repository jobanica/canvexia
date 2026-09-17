"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SidebarNav } from "./SidebarNav";
import type { NavEntry } from "./nav-items";
import { IconClose, IconMenu } from "./Icons";

/**
 * The same nav, as a drawer, on screens too narrow to pin it.
 *
 * CLOSES ON EVERY EXIT: the backdrop, Escape, a route change, and a click on a
 * link. The last one covers a link to the page you are already on, which
 * changes no route — `usePathname` never fires and the drawer would otherwise
 * sit open over the thing it was asked to show.
 */
export function MobileNav({
  links,
  pharmacyName,
  who,
  role,
}: {
  links: NavEntry[];
  pharmacyName: string;
  who: string;
  role: string;
}) {
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

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="rounded-lg border border-white/15 p-2 text-slate-300 hover:text-white lg:hidden"
      >
        <IconMenu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} aria-hidden />
          <nav className="app-shell relative flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-white/10 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <span className="text-lg font-semibold tracking-tight text-white">Resceta</span>
                <p className="truncate text-xs uppercase tracking-wider text-slate-500">
                  {pharmacyName}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="text-slate-500 hover:text-white"
              >
                <IconClose className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1">
              <SidebarNav links={links} onNavigate={() => setOpen(false)} />
            </div>

            <div className="border-t border-white/10 px-5 py-4">
              <p className="truncate text-sm font-medium text-white">{who}</p>
              <p className="text-xs text-slate-500">{role}</p>
              <form action="/logout" method="post" className="mt-2">
                <button type="submit" className="text-xs text-slate-500 hover:text-white hover:underline">
                  Sign out
                </button>
              </form>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
