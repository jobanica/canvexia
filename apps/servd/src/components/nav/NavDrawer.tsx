"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { IconClose, IconMenu } from "@/components/partner/PortalIcons";

/**
 * THE HAMBURGER AND THE DRAWER IT OPENS.
 *
 * What this replaces is a bottom bar that showed `[...main, ...secondary]
 * .slice(0, 5)` — the first five links of a nav that can run to fourteen. On a
 * phone, everything past the fifth had NO CONTROL ANYWHERE: the sidebar holding
 * it is `lg:flex`, so Brand, Domains, Commissions, Team and Settings were
 * reachable only by typing the URL. The permission said yes and the screen
 * offered nothing, which is the same defect as a disabled button with no
 * reason on it.
 *
 * So the drawer is not a style choice. Five slots cannot hold a list whose
 * length depends on a permission grid a partner edits themselves, and a list
 * that silently truncates is worse than one that costs a tap — because nobody
 * can tell it truncated.
 *
 * It opens from the LEFT, in the same order and grouping as the desktop
 * sidebar, so the two are one nav at two widths rather than two navs.
 *
 * CLOSING. Three ways, because a drawer that traps you is worse than no drawer:
 * the backdrop, Escape, and any tap inside the panel (that last one via a
 * bubbled click, which covers a link to the page you are already on — a
 * pathname that does not change fires no effect, and the drawer would sit there
 * looking broken).
 */
export function NavDrawer({
  label,
  header,
  children,
  className = "",
}: {
  /** Names the nav for screen readers, e.g. "Portal" or "HQ". */
  label: string;
  /** The brand lockup at the top of the panel. */
  header?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panel = useRef<HTMLDivElement>(null);

  // A completed navigation closes it. Next keeps this component mounted across
  // a route change inside the same layout, so without this the drawer would
  // still be sitting over the page you just asked for.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    // The page behind must not scroll under the drawer — on iOS that reads as
    // the drawer itself failing to scroll.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus moves into the panel so the keyboard and the screen reader are
    // where the eye is.
    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open ${label.toLowerCase()} menu`}
        aria-expanded={open}
        className={`-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-brand-ink/70 transition-colors hover:bg-brand-ink/[0.06] hover:text-brand-ink ${className}`}
      >
        <IconMenu size={22} />
      </button>

      {open && (
        /* No `lg:hidden` here: the shells hide the BUTTON above that width
           because they have a permanent sidebar, and a panel that vanished
           mid-open would strand whoever opened it. The field screen has no
           sidebar at any width and keeps the button. */
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-brand-ink/45"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            // Not full width: the sliver of dimmed page on the right is what
            // says "this is a layer, tap there to leave" without a caption.
            className="absolute inset-y-0 left-0 flex w-[17.5rem] max-w-[86%] flex-col overflow-y-auto bg-white shadow-2xl outline-none"
            onClick={() => setOpen(false)}
          >
            <div className="flex items-center justify-between gap-2 border-b border-brand-ink/10 px-4 py-3.5">
              {header ?? <span />}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="-mr-2 flex h-10 w-10 items-center justify-center rounded-xl text-brand-ink/55 hover:bg-brand-ink/[0.06] hover:text-brand-ink"
              >
                <IconClose size={20} />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col px-3 py-3">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
