import { parseHost } from "@/lib/host";

/**
 * The partner web app manifests, built per HOST rather than served as files.
 *
 * WHY THIS IS NOT TWO JSON FILES IN public/.
 *
 * The same portal answers on two shapes of address, and the paths differ:
 *
 *   partner.canvexia.com/partner/pipeline   — CANVEXIA's own front door
 *   cebu.canvexia.com/pipeline              — an operator's branded host
 *
 * Middleware prefixes `/partner` internally on the branded host, so the page
 * is identical and the URL is not. A static manifest has to pick one, and
 * `scope: "/partner"` is the wrong pick on the branded host: every URL an
 * operator actually browses there — /pipeline, /merchants, /attendance — falls
 * OUTSIDE it. An installed app treats an out-of-scope link as somebody else's
 * site and hands it to the browser, so the first tap after opening the app
 * drops the user into a tab with a URL bar. Which is precisely the failure the
 * field manifest's `scope` was widened to `/partner` to avoid in the first
 * place.
 *
 * So the scope follows the host. Everything else about the two apps is fixed.
 *
 * `id` matters here more than usual: the portal and the field app share a
 * scope, and a browser tells two installed apps apart by `id`, falling back to
 * `start_url`. Without it, changing either start_url would orphan whatever
 * people already put on their home screens.
 */

/**
 * A TILE COLOUR PER APP, because the name is not enough.
 *
 * One deployment ships three installable apps off one mark, and a home screen
 * truncates the label — "CANVEXIA H…" sat next to "CANVEXIA", both on identical
 * white tiles, and nothing on the screen said which was which. The colour is
 * what actually distinguishes them at a glance.
 *
 * The mark and its coral-into-ember band are the same in all three; only the
 * field behind it changes. That is the difference between "three apps from one
 * company" and "three copies of the same app".
 *
 *   HQ      white  — the desktop install, where a coloured tile is the odd one out
 *   portal  #3B1E54 — CANVEXIA's own purple, already this app's theme_color
 *   field   #1A1A1E — near-black, readable at a glance in sunlight
 */
function iconsFor(app: PartnerApp) {
  const stem = app === "field" ? "canvexia-field" : "canvexia-portal";
  return [
    { src: `/brand/${stem}-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
    { src: `/brand/${stem}-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
    {
      src: `/brand/${stem}-maskable-512.png`,
      sizes: "512x512",
      type: "image/png",
      // Without a maskable icon Android pastes the square PNG into its circle
      // and crops the mark's corners off.
      purpose: "maskable",
    },
  ] as const;
}

export type PartnerApp = "portal" | "field";

export interface WebManifest {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: "standalone";
  orientation?: "portrait";
  background_color: string;
  theme_color: string;
  icons: readonly { src: string; sizes: string; type: string; purpose: string }[];
}

/**
 * True when this host serves the portal at BARE paths — an operator's own
 * subdomain, where middleware adds the `/partner` prefix behind the scenes.
 *
 * `partner_root` is CANVEXIA's own front door and is deliberately NOT included:
 * there the user really is at /partner/..., and claiming `/` would put the HQ
 * console inside the portal app's scope.
 */
export function servesBarePaths(host: string | null | undefined): boolean {
  const info = parseHost(
    host ?? "",
    process.env.NEXT_PUBLIC_ROOT_DOMAIN,
    process.env.NEXT_PUBLIC_PARTNER_ROOT_DOMAIN,
  );
  return info.kind === "partner";
}

export function partnerManifest(app: PartnerApp, bare: boolean): WebManifest {
  // The prefix the user's address bar actually shows. "" on a branded host.
  const base = bare ? "" : "/partner";
  const scope = base || "/";

  if (app === "field") {
    return {
      id: `${scope === "/" ? "" : scope}/attendance`,
      name: "CANVEXIA Field",
      short_name: "Field",
      description:
        "Check in, log visits, and work your list — built for a phone, in or out of signal",
      start_url: `${base}/attendance`,
      // Wider than its own start_url on purpose: an installed app that kicked
      // the user out to a browser tab the moment they tapped through to a
      // merchant would be worse than no install at all.
      scope,
      display: "standalone",
      orientation: "portrait",
      background_color: "#FFFFFF",
      theme_color: "#3B1E54",
      icons: iconsFor(app),
    };
  }

  return {
    id: scope,
    name: "CANVEXIA",
    short_name: "CANVEXIA",
    description: "Your pipeline, your merchants, your team — the partner portal",
    // The Overview, NOT the field check-in screen. This is the whole reason the
    // portal needed a manifest of its own: it used to point at the field one,
    // so an operator admin who installed from the pipeline got an app that
    // opened on the one page of the portal they never use.
    start_url: scope,
    scope,
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#3B1E54",
    icons: iconsFor(app),
  };
}

/** The response both manifest routes return. */
export function manifestResponse(app: PartnerApp, host: string | null): Response {
  return new Response(JSON.stringify(partnerManifest(app, servesBarePaths(host)), null, 2), {
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
      // Varies by host, and a CDN keyed on the wrong one would hand an operator
      // CANVEXIA's scope or the reverse.
      vary: "host",
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}
