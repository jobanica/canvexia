import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE "NO CONNECTION" BANNER, AND TWO WAYS IT WAS WRONG.
 *
 * REPORTED — it said "No connection" on a machine that plainly had one, and
 * while doing so it ate the sidebar's column and pushed the page off the right
 * of the screen.
 *
 * Both failures are worse than the banner simply not existing. A false alarm
 * tells a cashier the till is broken while a customer is waiting, and the
 * second time they see it they stop believing it — including the time it is
 * true. A banner that breaks the layout it is warning about does the same for
 * the whole app.
 */

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

describe("deciding whether the connection is really down", () => {
  const hook = src("lib/useOnline.ts");

  it("confirms with the server before claiming there is no connection", () => {
    // `navigator.onLine` is derived from whether the OS thinks an interface is
    // up. A VPN, a virtual adapter, a captive portal or a VM display can leave
    // it false while HTTPS works fine — which is exactly what was reported.
    expect(hook).toContain('const PROBE_URL = "/api/ping"');
    expect(hook).toContain("const ok = await reachable();");
    // The probe only runs on the pessimistic branch; believing `true` outright
    // keeps a request off the wire every few seconds at every till.
    expect(hook).toContain("if (navigator.onLine) {");
  });

  it("never reports offline on the strength of navigator.onLine alone", () => {
    // The old bug in one line: `setOnline(navigator.onLine)`.
    expect(hook).not.toContain("setOnline(navigator.onLine)");
  });

  it("gives up on a hung socket rather than waiting forever", () => {
    // A dead-but-open connection would otherwise keep the banner hidden for as
    // long as the browser is willing to wait.
    expect(hook).toContain("abort.abort()");
    expect(hook).toContain("signal: abort.signal");
  });

  it("keeps asking while it believes the line is down", () => {
    // Some browsers never fire `online` after a flap, so the banner has to be
    // able to clear itself.
    expect(hook).toContain("retry = setTimeout(check, RETRY_MS);");
    expect(hook).toContain('document.addEventListener("visibilitychange", onVisible)');
  });

  it("starts optimistic, so no banner flashes on every page load", () => {
    expect(hook).toContain("useState(true)");
  });

  it("probes a route the service worker cannot answer from cache", () => {
    const sw = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
    // Everything that is not a navigation or a static asset is passthrough, so
    // /api/ping really does test the network.
    expect(sw).toContain("EVERYTHING ELSE");
    const route = src("app/api/ping/route.ts");
    expect(route).toContain('"Cache-Control": "no-store, no-cache, must-revalidate"');
  });
});

describe("where the banner sits", () => {
  const shell = src("components/AppShell.tsx");

  it("is not a child of the two-column grid", () => {
    // As a grid child it became the FIRST CELL: it took the sidebar's 264px
    // column, shoved the sidebar into the content column and pushed the page
    // off screen. The grid must open AFTER the banner.
    const banner = shell.indexOf("<OfflineNotice />");
    const grid = shell.indexOf('lg:grid lg:grid-cols-[264px_1fr]');
    expect(banner).toBeGreaterThan(-1);
    expect(grid).toBeGreaterThan(banner);
  });

  it("keeps the sidebar inside the viewport when the banner is showing", () => {
    // A fixed h-screen column under a banner hangs past the bottom of the
    // window by exactly the banner's height.
    expect(shell).toContain("lg:sticky lg:top-0");
  });
});
