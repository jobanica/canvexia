"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js, which is what makes the portal installable. Nothing else
 * depends on it, so a browser without service workers simply carries on.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // An install that fails costs the home-screen icon, nothing more.
    });
  }, []);

  return null;
}
