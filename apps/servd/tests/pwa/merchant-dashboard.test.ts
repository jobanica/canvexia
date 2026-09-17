import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { merchantManifest, monogram, monogramSvg } from "@/lib/merchant-app";
import { codeAt } from "../support/source";

/**
 * THE DASHBOARD INSTALLS AS THE SHOP'S OWN APP.
 *
 * It had no manifest, so it inherited the ROOT one — whose `start_url` is
 * `/cashier`. An owner installing from their dashboard got an app called
 * "Servd", wearing Servd's orange tile, that opened on the till. Every
 * merchant's phone showed the same icon; on a partner-sold shop it was a
 * competitor's brand sitting on their home screen.
 *
 * And the service worker was never registered on /admin at all, so even with a
 * manifest nothing was installable.
 */

const sw = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
const shell = codeAt("src/components/admin/AdminShell.tsx");
const layout = codeAt("src/app/(platform)/admin/layout.tsx");

const brand = { name: "Mango Grill", slug: "mango-grill", primaryColor: "#0F62FE" };

describe("the manifest is the shop's", () => {
  const m = merchantManifest(brand);

  it("opens on the dashboard, not the till", () => {
    expect(m.start_url).toBe("/admin");
  });

  it("is named after the shop", () => {
    expect(m.name).toContain("Mango Grill");
    expect(m.short_name).toBe("Mango Grill");
  });

  it("wears the shop's colour", () => {
    expect(m.theme_color).toBe("#0F62FE");
  });

  it("falls back to Servd's colour when the shop has set none", () => {
    // An empty string is what a blanked form field stores, and it would produce
    // a manifest with an invalid theme_color rather than a default one.
    expect(merchantManifest({ ...brand, primaryColor: "" }).theme_color).toBe("#FF7A1A");
    expect(merchantManifest({ ...brand, primaryColor: null }).theme_color).toBe("#FF7A1A");
  });

  it("carries an id, so it is not confused with the other three apps here", () => {
    // The till, the orders kiosk and the partner portal all share scope "/".
    // Without an id a browser may treat two of them as one app.
    expect(m.id).toBe("/admin");
  });

  it("keeps scope at the root, so signing out stays inside the app", () => {
    // Sign out goes to /login. A scope of /admin would throw the owner into a
    // browser tab at the moment they sign out of their own app.
    expect(m.scope).toBe("/");
  });

  it("offers a maskable icon", () => {
    expect(m.icons.some((i) => i.purpose === "maskable")).toBe(true);
  });

  it("points its own tile at its own slug", () => {
    expect(m.icons[0].src).toBe("/m/mango-grill/icon.svg");
  });

  it("keeps Servd's PNGs as the fallback", () => {
    // For anything that cannot render an SVG icon.
    expect(m.icons.some((i) => i.type === "image/png")).toBe(true);
  });
});

describe("the tile", () => {
  it("is the shop's initial on the shop's colour", () => {
    const svg = monogramSvg("Mango Grill", "#0F62FE");
    expect(svg).toContain(">M<");
    expect(svg).toContain("#0F62FE");
  });

  it("paints to the edge, so a mask cannot crop a black corner in", () => {
    expect(monogramSvg("Mango Grill", null)).toContain('<rect width="512" height="512"');
  });

  it("never leaves a blank tile for a name with no letter in it", () => {
    expect(monogram("🍜")).toBe("•");
    expect(monogram("   ")).toBe("•");
  });

  it("escapes a name that would otherwise break the document", () => {
    // The name comes from an owner, through a form.
    expect(monogramSvg("<script>", null)).not.toContain("<script>");
  });

  it("strips anything odd out of a colour before it reaches an attribute", () => {
    expect(monogramSvg("A", '"/><script>x</script>')).not.toContain("<script>");
  });
});

describe("the head points at it", () => {
  it("names the per-shop manifest rather than the root one", () => {
    // The root manifest's start_url is /cashier.
    expect(layout).toContain("manifest: `/m/${shop.slug}/manifest.webmanifest`");
  });

  it("gives iOS the shop's name and an icon it can actually render", () => {
    // iOS ignores the manifest entirely and cannot render the SVG monogram.
    expect(layout).toContain("title: name");
    expect(layout).toContain("/brand/icon-apple-180.png");
  });

  it("offers nothing to somebody who is not staff", () => {
    expect(layout).toContain('if (!user || user.kind !== "staff") return {};');
  });

  it("keeps a back office out of the search index", () => {
    expect(layout).toContain("robots: { index: false, follow: false }");
  });
});

describe("it is actually installable", () => {
  it("registers the service worker, which it never did before", () => {
    expect(shell).toContain("<ServiceWorkerRegister />");
  });

  it("offers the install below the work, per shop", () => {
    // A banner above the content pushes the day's orders down the screen every
    // visit; a shared storage key would hide it for a second shop on the same
    // phone.
    expect(shell).toContain("servd-install-admin-${brand.slug}");
    const main = shell.indexOf("{children}");
    const banner = shell.indexOf("<InstallApp");
    expect(banner).toBeGreaterThan(main);
  });

  it("lands back on the dashboard when a navigation fails, not on the till", () => {
    expect(sw).toContain('if (pathname.startsWith("/admin")) return "/admin";');
  });

  it("bumps the worker version, so the new fallback actually ships", () => {
    // The activate handler deletes caches that do not match VERSION; leaving it
    // alone would serve the old shell from a cache keyed to the old name.
    expect(sw).toContain('const VERSION = "servd-v6"');
  });

  it("still never touches a write", () => {
    expect(sw).toContain('if (req.method !== "GET") return;');
  });
});

describe("it says what an installed window hides", () => {
  it("warns when the connection goes", () => {
    expect(shell).toContain("useOnline()");
    expect(shell).toContain("nothing will save until it");
  });

  it("does not claim reading is broken too", () => {
    // Pages already opened are served from the cache.
    expect(shell).toContain("You can still read what is already open");
  });
});
