"use client";

import { useEffect } from "react";

/**
 * Hold a Screen Wake Lock while the merchant screen is open so the tablet
 * doesn't sleep mid-service. The lock is dropped by the browser when the tab is
 * hidden, so we re-acquire it whenever the page becomes visible again.
 *
 * Best-effort: unsupported browsers (or a denied request) simply no-op — the
 * always-on, plugged-in tablet (with OS sleep disabled) is the real guarantee.
 */
export function useWakeLock(active = true) {
  useEffect(() => {
    if (!active) return;
    type SentinelLike = { release: () => Promise<void>; addEventListener?: (t: string, cb: () => void) => void };
    let sentinel: SentinelLike | null = null;
    let cancelled = false;

    async function acquire() {
      try {
        const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<SentinelLike> } }).wakeLock;
        if (!wl) return;
        sentinel = await wl.request("screen");
        sentinel.addEventListener?.("release", () => {
          sentinel = null;
        });
      } catch {
        /* denied / unsupported — rely on the always-on tablet */
      }
    }

    function onVisibility() {
      if (document.visibilityState === "visible" && !sentinel && !cancelled) acquire();
    }

    acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [active]);
}
