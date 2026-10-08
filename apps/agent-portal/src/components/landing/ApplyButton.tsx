"use client";

import Link from "next/link";
import { track } from "@vercel/analytics";

/** Where on the page the visitor clicked. Recorded with every apply click. */
export type ApplyPosition = "header" | "hero" | "calculator" | "final" | "sticky";

/**
 * The page's only action. Every one of these goes to the same form.
 *
 * The position is recorded twice over, because the two ways cost nothing
 * together and survive different gaps: as a custom analytics event, and as
 * `?from=` on the link, which shows up as its own path in plain page views
 * even where custom events are not collected.
 */
export function ApplyButton({
  position,
  className = "",
  children = "Mag-apply bilang Agent",
}: {
  position: ApplyPosition;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={`/apply?from=${position}`}
      onClick={() => track("apply_click", { position })}
      className={`inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#7c5cf5] to-[#5b3fd6] px-6 py-4 text-center text-base font-semibold text-white shadow-lg shadow-violet-500/20 transition-shadow hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3fd6] focus-visible:ring-offset-2 ${className}`}
    >
      {children}
    </Link>
  );
}
