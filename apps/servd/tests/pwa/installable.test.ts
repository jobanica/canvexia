import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { partnerManifest, servesBarePaths } from "@/lib/partners/manifest";
import { codeAt } from "../support/source";

/**
 * Three audiences, three installable apps, one deployment.
 *
 * THE BUG THIS FILE EXISTS FOR: everything under /hq and most of /partner
 * inherited the ROOT layout's manifest, which is Servd's — start_url
 * `/cashier`, Servd's icons, "Servd Orders" under the home-screen icon. An
 * operator who installed CANVEXIA got a competitor product's logo opening on a
 * restaurant till. It was also not installable at all: a manifest without a
 * service worker controlling its start_url is inert, and the worker was
 * registered on three screens, none of them HQ or the portal.
 *
 * The file-shape assertions here cannot prove a browser offers the install —
 * only that the four things a browser requires are present and point at the
 * right product. The manifest contents are real assertions on real code.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("the HQ console installs as its own app", () => {
  const m = JSON.parse(read("public/hq.webmanifest")) as {
    id: string;
    name: string;
    start_url: string;
    scope: string;
    display: string;
    icons: { src: string; purpose?: string }[];
  };

  it("opens on the console, in standalone", () => {
    expect(m.id).toBe("/hq");
    expect(m.start_url).toBe("/hq");
    expect(m.scope).toBe("/hq");
    expect(m.display).toBe("standalone");
  });

  it("carries CANVEXIA's mark and never names Servd", () => {
    for (const i of m.icons) expect(i.src).toMatch(/^\/brand\/canvexia-/);
    expect(m.icons.some((i) => i.purpose === "maskable")).toBe(true);
    expect(JSON.stringify(m).toLowerCase()).not.toContain("servd");
  });

  it("stays a static file, because /hq answers at one shape of address", () => {
    // Unlike the two partner apps: /hq passes through only on CANVEXIA's own
    // host (ROOT_ONLY_PASS_THROUGH in middleware), so there is no branded host
    // where its paths are different.
    expect(read("src/app/(platform)/hq/layout.tsx")).toContain('manifest: "/hq.webmanifest"');
  });
});

/**
 * THE HOST PROBLEM.
 *
 * The same portal answers at partner.canvexia.com/partner/pipeline AND at
 * cebu.canvexia.com/pipeline — middleware adds the prefix behind the scenes on
 * an operator's branded host. A static manifest has to pick one set of paths,
 * and picking `/partner` breaks the branded host: every URL an operator browses
 * there falls outside the scope, so the first tap inside the installed app
 * hands them to a browser tab.
 */
describe.each([
  { where: "CANVEXIA's own host", bare: false, scope: "/partner", home: "/partner" },
  { where: "an operator's branded host", bare: true, scope: "/", home: "/" },
])("the partner apps on $where", ({ bare, scope, home }) => {
  const portal = partnerManifest("portal", bare);
  const field = partnerManifest("field", bare);

  it("scopes both apps to the paths that host actually shows", () => {
    expect(portal.scope).toBe(scope);
    expect(field.scope).toBe(scope);
  });

  it("opens the portal on the Overview and Field on check-in", () => {
    // The portal used to declare the FIELD manifest, so an operator admin who
    // installed from the pipeline got an app that opened on the staff
    // check-in screen — the one page of the portal they never use.
    expect(portal.start_url).toBe(home);
    expect(field.start_url).toBe(bare ? "/attendance" : "/partner/attendance");
  });

  it("keeps every start_url inside its own scope", () => {
    for (const m of [portal, field]) {
      expect(m.start_url.startsWith(m.scope), `${m.name}: ${m.start_url} vs ${m.scope}`).toBe(true);
    }
  });

  it("gives the two apps different ids, since they share a scope", () => {
    // A browser tells two installed apps apart by `id`, falling back to
    // start_url. Without it, changing either start_url orphans whatever people
    // already put on their home screens.
    expect(portal.id).not.toBe(field.id);
    expect(portal.id).toBe(scope);
  });

  it("carries CANVEXIA's mark, never Servd's", () => {
    for (const m of [portal, field]) {
      for (const i of m.icons) expect(i.src).toMatch(/^\/brand\/canvexia-/);
      expect(m.icons.some((i) => i.purpose === "maskable")).toBe(true);
      expect(JSON.stringify(m).toLowerCase()).not.toContain("servd");
      expect(m.display).toBe("standalone");
    }
  });
});

describe("which hosts get the bare-path scope", () => {
  const root = process.env.NEXT_PUBLIC_PARTNER_ROOT_DOMAIN;
  const withRoot = <T>(value: string, fn: () => T): T => {
    process.env.NEXT_PUBLIC_PARTNER_ROOT_DOMAIN = value;
    try {
      return fn();
    } finally {
      if (root === undefined) delete process.env.NEXT_PUBLIC_PARTNER_ROOT_DOMAIN;
      else process.env.NEXT_PUBLIC_PARTNER_ROOT_DOMAIN = root;
    }
  };

  it("an operator's own subdomain does", () => {
    expect(withRoot("canvexia.com", () => servesBarePaths("cebu.canvexia.com"))).toBe(true);
  });

  it("CANVEXIA's own front door does NOT", () => {
    // partner.canvexia.com really does serve /partner/..., and claiming `/`
    // there would pull the HQ console inside the portal app's scope.
    expect(withRoot("canvexia.com", () => servesBarePaths("partner.canvexia.com"))).toBe(false);
  });

  it("neither does a preview, localhost, or an unknown host", () => {
    for (const h of ["canvexia-abc.vercel.app", "localhost", "", null]) {
      expect(withRoot("canvexia.com", () => servesBarePaths(h)), String(h)).toBe(false);
    }
  });
});

describe("the manifest routes", () => {
  it("are routes, not files — a file in public/ would shadow them", () => {
    // If either of these comes back, the host-aware version is dead code and
    // the branded host silently breaks again.
    for (const p of ["public/partner.webmanifest", "public/partner-field.webmanifest"]) {
      expect(() => read(p), `${p} must not exist`).toThrow();
    }
    for (const p of [
      "src/app/partner.webmanifest/route.ts",
      "src/app/partner-field.webmanifest/route.ts",
    ]) {
      expect(read(p)).toContain("manifestResponse");
    }
  });

  it("are declared by the layouts that own each surface", () => {
    expect(read("src/app/(platform)/partner/layout.tsx")).toContain(
      'manifest: "/partner.webmanifest"',
    );
    expect(read("src/app/(platform)/partner/attendance/layout.tsx")).toContain(
      'manifest: "/partner-field.webmanifest"',
    );
  });

  it("bypass middleware, so the /partner prefix is never applied to them", () => {
    // The matcher excludes any path containing a dot. If that ever changes,
    // /partner.webmanifest on a branded host becomes /partner/partner.webmanifest.
    expect(read("src/middleware.ts")).toContain("(?!_next/|api/|.*\\\\..*)");
  });
});

describe("the parts a manifest cannot supply on its own", () => {
  it("registers a service worker on every CANVEXIA shell", () => {
    // A manifest without a worker controlling the start_url is not installable
    // — this is the half that was missing on /hq and on the portal.
    for (const p of [
      "src/app/(platform)/hq/layout.tsx",
      "src/app/(platform)/partner/layout.tsx",
      "src/app/(platform)/partner/attendance/layout.tsx",
    ]) {
      expect(read(p), p).toContain("<ServiceWorkerRegister />");
    }
  });

  it("serves that worker from the root, so one registration covers every scope", () => {
    // /sw.js at the root means scope `/`. A worker served from /partner/sw.js
    // could never control /hq, and we would need two.
    expect(read("src/components/offline/ServiceWorkerRegister.tsx")).toContain('register("/sw.js")');
  });

  it("gives the worker a fetch handler, which is what a browser actually checks", () => {
    expect(read("public/sw.js")).toContain('addEventListener("fetch"');
  });

  it("falls back offline to the surface the user is on, not to Servd's till", () => {
    // THE REGRESSION THIS CATCHES: the navigation fallback was `/cashier` for
    // every path. Once /hq and /partner registered this worker, an offline
    // CANVEXIA user with nothing cached would have landed on a restaurant
    // till — a stranger's product, at the moment they have no signal to work
    // out why.
    const sw = read("public/sw.js");
    expect(sw).toContain("offlineShell(url.pathname)");
    const fn = sw.slice(sw.indexOf("function offlineShell"));
    expect(fn).toContain('"/partner/attendance"');
    expect(fn).toContain('"/hq"');
  });

  it("says CANVEXIA under the icon on iOS, where the manifest is ignored", () => {
    // iOS reads `apple-mobile-web-app-title`, not the manifest's short_name.
    // Inherited from the root it said "Servd Orders".
    expect(read("src/app/(platform)/hq/layout.tsx")).toContain('title: "CANVEXIA HQ"');
    expect(read("src/app/(platform)/partner/layout.tsx")).toContain('title: "CANVEXIA"');
  });

  it("does not leave Servd's icons on the field app", () => {
    // The field layout declared /brand/icon-192.png and /brand/icon-apple-180.png
    // — Servd's — which override the manifest for the tab and for iOS. A
    // salesperson got a competitor product's logo on their home screen.
    const layout = codeAt("src/app/(platform)/partner/attendance/layout.tsx");
    expect(layout).not.toContain("/brand/icon-192.png");
    expect(layout).not.toContain("/brand/icon-apple-180.png");
    expect(layout).toContain("/brand/canvexia-field-180.png");
  });
});

describe("the install button", () => {
  const install = read("src/components/pwa/InstallApp.tsx");

  it("holds the browser's own prompt instead of letting it disappear", () => {
    // Chrome fires beforeinstallprompt once. Without preventDefault it shows a
    // mini-infobar most people dismiss without reading, and the event is gone.
    expect(install).toContain("beforeinstallprompt");
    expect(install).toContain("e.preventDefault()");
  });

  it("tells iOS users the three taps, because Safari has no prompt at all", () => {
    expect(install).toContain("Add to Home Screen");
  });

  it("disappears once installed", () => {
    // A banner that survives being installed is the most annoying thing a web
    // app does.
    expect(install).toContain('matchMedia?.("(display-mode: standalone)")');
    expect(install).toContain('addEventListener("appinstalled"');
  });

  it("remembers a dismissal per app, not once for all three", () => {
    // One phone can carry Field and the portal. Saying "no thanks" to one must
    // not silently hide the other.
    const keys = [
      ["src/components/hq/HqShell.tsx", "canvexia-install-hq"],
      ["src/components/partner/PortalShell.tsx", "canvexia-install-portal"],
      ["src/components/partner/FieldApp.tsx", "canvexia-install-field"],
    ] as const;
    for (const [file, key] of keys) expect(read(file), file).toContain(key);
    expect(new Set(keys.map(([, k]) => k)).size).toBe(3);
  });

  it("is in the main column, not the sidebar that phones never see", () => {
    // Both shells hide the sidebar below `lg`, and a phone is the device
    // anybody actually installs this on.
    for (const p of ["src/components/hq/HqShell.tsx", "src/components/partner/PortalShell.tsx"]) {
      const shell = read(p);
      const mount = shell.indexOf("<InstallApp");
      expect(mount, p).toBeGreaterThan(-1);
      expect(shell.lastIndexOf("<main", mount), p).toBeGreaterThan(shell.indexOf("</aside>"));
    }
  });
});

describe("Servd's own manifest is left alone", () => {
  it("still points at the cashier, under Servd's icons", () => {
    // The CANVEXIA work must not have quietly rebranded the other product.
    const m = JSON.parse(read("public/manifest.webmanifest")) as {
      start_url: string;
      icons: { src: string }[];
    };
    expect(m.start_url).toBe("/cashier");
    expect(m.icons.every((i) => !i.src.startsWith("/brand/canvexia-"))).toBe(true);
  });
});


/**
 * The three tiles, and why they are three.
 *
 * REPORTED: two CANVEXIA icons on one Android home screen, identical white
 * circles, labels truncated to "CANVEXIA H…" and "CANVEXIA". Nothing on the
 * screen said which was which.
 */
describe("each installable app has its own tile colour", () => {
  const hq = JSON.parse(read("public/hq.webmanifest")) as { icons: { src: string }[] };
  const portal = partnerManifest("portal", false);
  const field = partnerManifest("field", false);

  const stems = (icons: readonly { src: string }[]) =>
    new Set(icons.map((i) => i.src.replace(/-(?:180|192|512|maskable-512)\.png$/, "")));

  it("gives no two apps the same icon set", () => {
    const sets = [hq.icons, portal.icons, field.icons].map((i) => [...stems(i)].sort().join("|"));
    expect(new Set(sets).size, `three apps, ${new Set(sets).size} distinct icon sets`).toBe(3);
  });

  it("names each set after the app it belongs to", () => {
    expect([...stems(hq.icons)]).toEqual(["/brand/canvexia"]);
    expect([...stems(portal.icons)]).toEqual(["/brand/canvexia-portal"]);
    expect([...stems(field.icons)]).toEqual(["/brand/canvexia-field"]);
  });

  it("still gives every one of them a maskable variant", () => {
    // Android crops to a circle. Losing this while recolouring would clip the
    // mark's corners off on exactly the devices this was reported from.
    for (const [what, m] of [["portal", portal], ["field", field]] as const) {
      expect(m.icons.some((i) => i.purpose === "maskable"), what).toBe(true);
    }
    expect(
      (JSON.parse(read("public/hq.webmanifest")) as { icons: { purpose?: string }[] }).icons.some(
        (i) => i.purpose === "maskable",
      ),
    ).toBe(true);
  });

  it("renders them from one script, so they cannot drift apart", () => {
    // Three hand-edited PNGs is three chances for the mark to differ between
    // apps. Only the field behind it is allowed to.
    const script = read("scripts/render-brand-icons.py");
    expect(script).toContain("VARIANTS");
    for (const stem of ["canvexia-portal", "canvexia-field"]) expect(script).toContain(stem);
    // The gradient band is what keeps them one family; it is never recoloured.
    expect(script).toContain("The gradient band is NOT recoloured");
  });

  it("points iOS at the right tile, since iOS ignores the manifest", () => {
    expect(codeAt("src/app/(platform)/partner/layout.tsx")).toContain(
      'apple: "/brand/canvexia-portal-180.png"',
    );
    expect(codeAt("src/app/(platform)/partner/attendance/layout.tsx")).toContain(
      "/brand/canvexia-field-180.png",
    );
    // HQ keeps the white one.
    expect(codeAt("src/app/(platform)/hq/layout.tsx")).toContain('apple: "/brand/canvexia-180.png"');
  });

  it("keeps the browser TAB on the plain mark", () => {
    // A tab is 16px of white chrome. A purple tile there is a smudge.
    for (const p of [
      "src/app/(platform)/partner/layout.tsx",
      "src/app/(platform)/hq/layout.tsx",
    ]) {
      expect(codeAt(p), p).toContain('icon: [{ url: "/brand/canvexia-mark.svg"');
    }
  });
});
