import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * An installed PWA can only navigate inside its manifest `scope`. Leaving that
 * scope in a standalone WebAPK does not degrade gracefully on Android — it
 * bounces out of the app, and on some builds takes the app down with it
 * ("Orders keeps stopping").
 *
 * The merchant app shipped with scope "/merchant", so the moment a session
 * lapsed and the page redirected to /login the app was out of bounds. Nobody
 * could diagnose it by reinstalling, because a reinstall fetches the same
 * manifest.
 *
 * These assert that every screen each app can actually reach is inside its own
 * scope.
 */

function manifest(name: string) {
  return JSON.parse(readFileSync(join(process.cwd(), "public", name), "utf8")) as {
    start_url: string;
    scope: string;
  };
}

/** Would a WebAPK with this scope be allowed to open this path? */
function inScope(scope: string, path: string): boolean {
  return path === scope || path.startsWith(scope.endsWith("/") ? scope : `${scope}/`);
}

describe("merchant.webmanifest", () => {
  const m = manifest("merchant.webmanifest");

  it("still launches straight into the orders screen", () => {
    expect(m.start_url).toBe("/merchant");
  });

  it("covers sign-in, which any lapsed session redirects to", () => {
    // The actual bug: /login sits outside a "/merchant" scope, so an expired
    // token took the installed app down instead of asking staff to sign in.
    expect(inScope(m.scope, "/login")).toBe(true);
  });

  it("covers everywhere the merchant screen can send someone", () => {
    for (const path of ["/merchant", "/login", "/suspended", "/admin/billing"]) {
      expect(inScope(m.scope, path)).toBe(true);
    }
  });
});

describe("manifest.webmanifest", () => {
  const m = manifest("manifest.webmanifest");

  it("covers sign-in too", () => {
    expect(inScope(m.scope, "/login")).toBe(true);
  });

  it("launches into the cashier screen", () => {
    expect(m.start_url).toBe("/cashier");
  });
});

describe("inScope", () => {
  it("does not let a sibling path masquerade as in-scope", () => {
    // "/merchant-tools" is NOT inside "/merchant"; a bare startsWith says it is.
    expect(inScope("/merchant", "/merchant-tools")).toBe(false);
    expect(inScope("/merchant", "/merchant")).toBe(true);
    expect(inScope("/merchant", "/merchant/orders")).toBe(true);
    expect(inScope("/", "/anything/at/all")).toBe(true);
  });
});
