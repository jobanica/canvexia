"use client";

import { useEffect, useState } from "react";

/**
 * Whether the counter can actually reach the server.
 *
 * REPORTED — the banner said "No connection" on a machine that plainly had
 * one. The old version trusted `navigator.onLine`, on the usual advice that
 * `false` is reliable. It is not. `onLine` is derived from whether the OS
 * thinks an interface is up, and a VPN, a virtual adapter, a captive portal or
 * a headless/VM display can leave it reading false while HTTPS works fine. A
 * false alarm here is worse than no banner at all: it tells a cashier the till
 * is broken while they are serving somebody, and the second time they see it
 * they stop believing it — including the time it is true.
 *
 * SO `onLine` IS A HINT AND THE PROBE IS THE ANSWER. `true` means carry on.
 * `false` means ask the server before saying anything, and only report a
 * problem if the ask fails. It is still used to WARN, never to decide — the
 * server is what refuses a sale, and it refuses it by not answering.
 *
 * STARTS TRUE, always. Guessing "offline" during the first render would flash
 * an alarming banner at every cashier on every page load.
 */
const PROBE_URL = "/api/ping";
const PROBE_TIMEOUT_MS = 5000;
/** How often to re-ask while we believe the connection is down. */
const RETRY_MS = 15000;

async function reachable(): Promise<boolean> {
  // A hung socket is not "online". Without the timeout a dead-but-open
  // connection leaves the banner hidden for as long as the browser waits.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(PROBE_URL, {
      method: "GET",
      cache: "no-store",
      signal: abort.signal,
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    async function check() {
      if (cancelled) return;

      // The optimistic half: an interface is up, so believe it. Probing on
      // every check would put a request on the wire every fifteen seconds at
      // every till, for a question that is almost always "yes".
      if (navigator.onLine) {
        setOnline(true);
        return;
      }

      const ok = await reachable();
      if (cancelled) return;
      setOnline(ok);

      // Keep asking while it looks down, so the banner clears itself when the
      // signal comes back — some browsers never fire `online` after a flap.
      if (!ok) {
        clearTimeout(retry);
        retry = setTimeout(check, RETRY_MS);
      }
    }

    void check();

    const onVisible = () => {
      // Coming back to a backgrounded till is the moment the answer is most
      // likely to have changed.
      if (document.visibilityState === "visible") void check();
    };

    window.addEventListener("online", check);
    window.addEventListener("offline", check);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearTimeout(retry);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", check);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return online;
}
