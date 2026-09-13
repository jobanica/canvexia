"use client";

import { useEffect, useState } from "react";

/**
 * Tracks browser connectivity. Uses the `online`/`offline` events (instant) plus
 * a light heartbeat to /api/health to catch "connected to Wi-Fi but no internet"
 * cases that `navigator.onLine` misses.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const set = (v: boolean) => setOnline(v);
    set(navigator.onLine);

    const on = () => set(true);
    const off = () => set(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);

    let cancelled = false;
    const beat = async () => {
      try {
        const res = await fetch("/api/ping", { method: "HEAD", cache: "no-store" });
        if (!cancelled) set(res.ok);
      } catch {
        if (!cancelled) set(false);
      }
    };
    const t = setInterval(beat, 20000);

    return () => {
      cancelled = true;
      clearInterval(t);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return online;
}
