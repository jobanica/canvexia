"use client";

import { useEffect } from "react";

/** Registers the offline service worker. Mount only on staff screens that opt in. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* SW is an enhancement — failure is non-fatal */
    });
  }, []);
  return null;
}
