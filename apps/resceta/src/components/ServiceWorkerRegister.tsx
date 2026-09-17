"use client";

import { useEffect } from "react";

/**
 * Registers the offline shell.
 *
 * A manifest alone makes nothing installable — the browser also wants a service
 * worker with a fetch handler controlling the start_url. It is also what makes
 * a half-loaded screen survive a dropped connection, which at a pharmacy
 * counter on one bar of signal is the point.
 *
 * Failure is swallowed: the worker is an enhancement, and a pharmacy that
 * cannot register one must still be able to sell.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* an enhancement — never fatal */
    });
  }, []);
  return null;
}
