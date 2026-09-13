"use client";

import { useEffect, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Re-run something whenever this restaurant's orders change.
 *
 * The cashier board already did this inline, but the panels stacked on top of
 * it — the shift summary, the closed-ticket list — each fetched once when they
 * opened and then sat there. A cashier looking at the end-of-shift figures
 * while another till settled a bill saw numbers that had stopped being true,
 * with nothing on screen to say so. The same is true of the cashier's own
 * actions in another window.
 *
 * Realtime is best-effort — a tablet on café Wi-Fi drops its socket and nobody
 * is told — so the poll is not a fallback for when Supabase is misconfigured,
 * it's the guarantee. The broadcast just makes the common case instant.
 *
 * The callback is held in a ref so a caller can pass an inline closure without
 * tearing down and rebuilding the subscription on every render.
 */
export function useOrdersRefresh(
  restaurantId: string,
  onChange: () => void,
  pollMs = 10_000,
): void {
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!restaurantId) return;
    const run = () => cb.current();

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`orders-${restaurantId}`)
      .on("broadcast", { event: "refresh" }, run)
      .subscribe();

    const poll = setInterval(run, pollMs);
    // A tablet that was asleep has missed every broadcast in between, and its
    // socket may not have noticed yet. Catch up the moment it's looked at.
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [restaurantId, pollMs]);
}
