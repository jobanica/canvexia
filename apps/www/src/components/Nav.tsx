"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wordmark } from "./Brand";
import { Container, Cta } from "./ui";
import { SITE, portalIsExternal } from "@/lib/site";

const LINKS = [
  { href: "#products", label: "Products" },
  { href: "#how", label: "How it works" },
  { href: "#cities", label: "Cities & fees" },
  { href: "#faq", label: "FAQ" },
];

/**
 * Sticky nav, hamburger under `lg`.
 *
 * The menu closes on navigation and on Escape, and the page behind it does not
 * scroll while it is open — three small things that are individually invisible
 * and collectively the difference between a menu and an annoyance on a phone.
 */
export function Nav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper/90 backdrop-blur">
      <Container className="flex h-[72px] items-center justify-between gap-4">
        <Link href="/" aria-label="CANVEXIA home" className="shrink-0">
          <Wordmark size={24} />
        </Link>

        <nav className="hidden items-center gap-8 lg:flex" aria-label="Main">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-ink-soft transition-colors hover:text-ink"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Cta
            href={SITE.portalUrl}
            variant="outline"
            external={portalIsExternal}
            className="!min-h-[44px] !px-5 text-sm"
          >
            Partner login
          </Cta>
          {SITE.bookingUrl && (
            <Cta
              href={SITE.bookingUrl}
              external
              arrow
              className="!min-h-[44px] !pl-5 !pr-1.5 text-sm"
            >
              Book a call
            </Cta>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          className="-mr-2 flex w-11 items-center justify-center lg:hidden"
        >
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          <span aria-hidden="true" className="flex w-5 flex-col gap-[5px]">
            <span className={`h-[2px] w-full bg-ink transition-transform ${open ? "translate-y-[7px] rotate-45" : ""}`} />
            <span className={`h-[2px] w-full bg-ink transition-opacity ${open ? "opacity-0" : ""}`} />
            <span className={`h-[2px] w-full bg-ink transition-transform ${open ? "-translate-y-[7px] -rotate-45" : ""}`} />
          </span>
        </button>
      </Container>

      {open && (
        <div id="mobile-menu" className="border-t border-line bg-paper lg:hidden">
          <Container className="flex flex-col gap-1 py-4">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="flex min-h-[48px] items-center border-b border-line/70 text-base font-medium text-ink"
              >
                {l.label}
              </a>
            ))}
            <div className="mt-4 flex flex-col gap-3">
              {SITE.bookingUrl && (
                <Cta href={SITE.bookingUrl} external>
                  Book a call
                </Cta>
              )}
              <Cta href={SITE.portalUrl} variant="outline" external={portalIsExternal}>
                Partner login
              </Cta>
            </div>
          </Container>
        </div>
      )}
    </header>
  );
}
