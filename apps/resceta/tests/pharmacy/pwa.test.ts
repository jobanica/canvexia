import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * RESCETA INSTALLS, AND SAYS WHAT IT CANNOT DO WHEN IT IS OFFLINE.
 *
 * A pharmacy counter runs on a phone or a cheap tablet beside the till, all
 * day, on one bar of signal. It had no manifest, no service worker and no
 * icons, so it could only ever be a browser tab.
 *
 * Installing it creates a hazard the browser tab did not have: in a standalone
 * window there is no address bar, no reload spinner and no dinosaur, so a
 * dropped connection looks exactly like a working one until a Complete button
 * hangs with a customer waiting. Half of what is asserted here is the app
 * saying so.
 */

const root = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const src = (p: string) => root(join("src", p));

describe("it is installable at all", () => {
  const manifest = JSON.parse(root("public/manifest.webmanifest"));

  it("has the three things a browser insists on", () => {
    // A manifest with a start_url, icons at 192 and 512, and a service worker
    // with a fetch handler controlling that start_url.
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(root("public/sw.js")).toContain('addEventListener("fetch"');
  });

  it("ships a maskable icon", () => {
    // Android crops a non-maskable icon into a circle and cuts the corners off.
    expect(
      manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable"),
    ).toBe(true);
  });

  it("registers the worker at the root, covering the whole scope", () => {
    // An installed app that dropped the user into a browser tab the moment they
    // tapped through to a receipt would be worse than no install.
    expect(src("app/layout.tsx")).toContain("<ServiceWorkerRegister />");
    expect(manifest.scope).toBe("/");
  });

  it("gives iOS the icon it actually reads", () => {
    // iOS ignores the manifest entirely. Without this an install gets a
    // screenshot of the page.
    expect(src("app/layout.tsx")).toContain("/apple-touch-icon.png");
    expect(src("app/layout.tsx")).toContain('title: "Resceta"');
  });

  it("does not take pinch-zoom away", () => {
    // This screen carries drug names, strengths and expiry dates read under a
    // fluorescent tube at the end of a shift.
    expect(src("app/layout.tsx")).not.toContain("maximumScale");
    expect(src("app/layout.tsx")).not.toContain("userScalable");
  });
});

describe("the worker never touches a write", () => {
  const sw = root("public/sw.js");

  it("ignores anything that is not a GET", () => {
    // A sale allocates specific batches and mints a gapless receipt number.
    // Replaying one from a cache is not a degraded experience, it is wrong
    // stock and a duplicate receipt.
    expect(sw).toContain('if (req.method !== "GET") return;');
  });

  it("ignores other origins", () => {
    expect(sw).toContain("if (url.origin !== self.location.origin) return;");
  });

  it("never caches the sign-in pages", () => {
    // Their correct content depends entirely on a session cookie the cache
    // knows nothing about.
    expect(sw).toContain("function isAuthPath");
    expect(sw).toContain("if (isAuthPath(url.pathname)) return;");
  });

  it("does not cache a redirect as though it were a page", () => {
    // Caching a bounce to /login pins a signed-out response onto a URL that
    // works again the moment somebody signs in.
    expect(sw).toContain("if (fresh.ok && !fresh.redirected)");
  });

  it("is network-first for pages, so nobody reads stale stock", () => {
    const nav = sw.slice(sw.indexOf('req.mode === "navigate"'));
    const fetchAt = nav.indexOf("await fetch(req)");
    const cacheAt = nav.indexOf("caches.match(req)");
    expect(fetchAt).toBeGreaterThan(-1);
    expect(cacheAt).toBeGreaterThan(fetchAt);
  });

  it("falls back to the dashboard, which is the screen worth reading offline", () => {
    expect(sw).toContain('caches.match("/")');
  });
});

describe("it says what it cannot do", () => {
  it("warns on every screen, above everything", () => {
    expect(src("components/AppShell.tsx")).toContain("<OfflineNotice />");
  });

  it("refuses a sale rather than hanging, and says why on the button", () => {
    const counter = src("app/pos/Counter.tsx");
    expect(counter).toContain("|| !online");
    expect(counter).toContain("a sale cannot be recorded until it comes back");
  });

  it("does not claim reading is broken too", () => {
    // The dashboard, the catalogue and an already-opened receipt are served
    // from the cache. Saying "you are offline" and stopping would be less true
    // and less useful.
    expect(src("components/OfflineNotice.tsx")).toContain("You can still look things up");
  });

  it("assumes online until told otherwise", () => {
    // `navigator.onLine` does not exist on the server, and guessing offline on
    // the first render flashes an alarming banner at every cashier on every
    // page load.
    expect(src("lib/useOnline.ts")).toContain("useState(true)");
  });

  it("treats the browser's opinion as a warning, not a gate on correctness", () => {
    // `onLine` true only means a network interface exists. The server is what
    // refuses a sale, and it refuses by not answering.
    expect(src("lib/useOnline.ts")).toContain("used to WARN, never to");
  });
});

describe("the install prompt", () => {
  const install = src("components/InstallApp.tsx");

  it("renders nothing once installed", () => {
    // A banner that survives being installed is the most annoying thing a web
    // app does.
    expect(install).toContain("if (isStandalone()) return;");
    expect(install).toContain('window.addEventListener("appinstalled"');
  });

  it("holds Chrome's own event rather than losing it to the mini-infobar", () => {
    expect(install).toContain("e.preventDefault()");
  });

  it("tells iOS the three taps instead of showing a button that cannot work", () => {
    expect(install).toContain("Add to Home Screen");
    // And not to iOS browsers that have no such option at all.
    expect(install).toContain("CriOS|FxiOS|EdgiOS|OPiOS");
  });

  it("sits below the work, not above it", () => {
    // Anchored on the LAST section of the dashboard rather than a heading,
    // because the headings moved: the expiry and stock tables this used to
    // name are the Alerts screen now, and the dashboard leads with the money.
    // The rule is unchanged — an install banner must not push the figures down
    // the screen on every visit.
    const page = src("app/page.tsx");
    const content = page.indexOf("Latest receipts");
    const banner = page.indexOf("<InstallApp");
    expect(content).toBeGreaterThan(-1);
    expect(banner).toBeGreaterThan(content);
  });

  it("can be dismissed for good", () => {
    expect(install).toContain("localStorage.setItem(STORAGE_KEY");
  });
});
