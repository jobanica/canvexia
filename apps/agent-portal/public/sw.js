/*
 * The portal's service worker. Hand-written: the build rules say no new
 * framework or library, and what this needs to do is small.
 *
 * It exists so the portal is installable on a phone, not to make the app work
 * offline. That distinction matters here, because every page behind the login
 * is somebody's commission data on a shared phone: pages, API routes and the
 * signed storage URLs are NEVER written to the cache. Only the build's own
 * immutable assets and the app icons are, and a navigation made with no
 * connection gets a plain "you are offline" page instead of a stale one
 * belonging to whoever signed in last.
 */

const CACHE = "canvexia-agents-v1";
const ASSETS = ["/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/apple-touch-icon.png"];

const OFFLINE_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline · CANVEXIA Agents</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;
    font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#0f0d18;color:#f1f0f9}
  div{max-width:22rem;text-align:center}
  h1{font-size:1.25rem;margin:0 0 .5rem}
  p{color:#a5a1c2;line-height:1.5;margin:0 0 1.5rem}
  button{border:0;border-radius:999px;padding:.75rem 1.5rem;font:inherit;font-weight:600;
    color:#fff;background:linear-gradient(to right,#7c5cf5,#5b3fd6)}
</style></head>
<body><div>
  <h1>You are offline</h1>
  <p>CANVEXIA Agents needs a connection to show your customers and commission.</p>
  <button onclick="location.reload()">Try again</button>
</div></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Only the build's content-hashed assets and the icons above. Everything else
// is somebody's data.
function cacheable(url) {
  return url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || ASSETS.includes(url.pathname));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(
        () => new Response(OFFLINE_PAGE, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }),
      ),
    );
    return;
  }

  const url = new URL(req.url);
  if (!cacheable(url)) return; // not handled: straight to the network

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
