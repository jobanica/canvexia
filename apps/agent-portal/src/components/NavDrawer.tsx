"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";

/**
 * The phone menu: a hamburger button that slides the navigation in from the
 * left over the page. The panel is mounted only while it is open, so the links
 * are never sitting off-screen in the tab order.
 */
export function NavDrawer({
  panelClassName,
  buttonClassName = "",
  desktopHidden = false,
  children,
}: {
  panelClassName: string;
  buttonClassName?: string;
  /** True for the admin area, which has a permanent sidebar from `lg` up. */
  desktopHidden?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const path = usePathname();

  // Tapping a link navigates; the drawer must not stay over the new page.
  useEffect(() => setOpen(false), [path]);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const hide = desktopHidden ? "lg:hidden" : "";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className={`grid shrink-0 place-items-center rounded-lg ${hide} ${buttonClassName}`}
      >
        <Icon name="menu" className="h-6 w-6" />
      </button>

      {open && (
        <div className={`fixed inset-0 z-50 ${hide}`}>
          <div className="drawer-fade absolute inset-0 bg-black/60" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className={`drawer-in absolute inset-y-0 left-0 flex w-72 max-w-[82%] flex-col overflow-y-auto pt-[env(safe-area-inset-top)] shadow-2xl outline-none ${panelClassName}`}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-4 grid h-9 w-9 place-items-center rounded-lg opacity-70 hover:opacity-100"
            >
              <Icon name="close" className="h-5 w-5" />
            </button>
            {children}
          </div>
        </div>
      )}
    </>
  );
}
