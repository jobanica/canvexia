/* Resceta's offline shell.
 *
 * DELIBERATELY CONSERVATIVE, and the reason is what this app does. A pharmacy
 * counter allocates stock from specific batches by expiry (FEFO), decrements
 * them, and mints a GAPLESS receipt number. None of that can be done twice for
 * one sale and none of it can be guessed at from a phone with no signal, so
 * this service worker will never touch a write.
 *
 *   Navigations (GET documents)  network-first, falling back to a cached copy
 *                                so a screen you have already opened still
 *                                renders during a dropout.
 *   Static assets               stale-while-revalidate.
 *   EVERYTHING ELSE             passthrough. POSTs, server actions and API
 *                               calls are never cached and never replayed.
 *
 * WHAT THIS IS NOT. It is not offline selling. The app says so on the counter
 * rather than letting a cashier tap Complete and watch it hang — see
 * OfflineNotice. An installable app that silently cannot do its one job is
 * worse than a browser tab that obviously cannot.
 */
const VERSION = "resceta-v2";
const PAGES = `${VERSION}-pages`;
const ASSETS = `${VERSION}-assets`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});

function isAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    /\.(?:png|svg|jpg|jpeg|webp|ico|woff2?)$/.test(url.pathname)
  );
}

/**
 * NEVER CACHE THE SIGN-IN PAGE, and never serve a cached one.
 *
 * It is the one document whose correct content depends entirely on a session
 * cookie the cache knows nothing about. A cached copy handed to somebody who
 * has just signed in shows them a login form; handed to somebody signed out of
 * a shared till, it can show the shape of the last session. Straight to the
 * network, every time.
 */
function isAuthPath(pathname) {
  return (
    pathname === "/login" ||
    pathname === "/logout" ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/forgot-password")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never touch writes / server actions
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (isAuthPath(url.pathname)) return;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          // Only a real page is worth keeping. Caching a redirect to /login
          // would pin a signed-out response onto a URL that works again the
          // moment somebody signs in.
          if (fresh.ok && !fresh.redirected) {
            const cache = await caches.open(PAGES);
            cache.put(req, fresh.clone());
          }
          return fresh;
        } catch {
          const cached = await caches.match(req);
          // The dashboard is the honest fallback: it is the screen that answers
          // "what is expiring and what is running out", which is the one thing
          // still worth reading with no signal. If it is not cached either, the
          // browser's own offline page is at least not a lie.
          return cached || (await caches.match("/")) || Response.error();
        }
      })(),
    );
    return;
  }

  if (isAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSETS);
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })(),
    );
  }
});
