"use client";

import { useEffect, useRef } from "react";

/**
 * Clear the unread badge once the page has actually been seen.
 *
 * Runs AFTER paint, deliberately. Marking them read on the server during render
 * would clear the "New" highlight before the owner ever saw it — the page would
 * load already looking like old news, and they'd have no idea which item was
 * the one the badge was about.
 *
 * Fires once per mount; the ref guards against React's development double-run.
 */
export function MarkAnnouncementsRead({ action }: { action: () => Promise<void> }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    // A short delay so the highlight is genuinely on screen first.
    const t = setTimeout(() => void action(), 1200);
    return () => clearTimeout(t);
  }, [action]);
  return null;
}
