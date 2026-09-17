import { SERVD_DEFAULTS } from "@/lib/theme/brand";

/**
 * THE INSTALLED DASHBOARD IS THE SHOP'S, NOT SERVD'S.
 *
 * One deployment serves hundreds of restaurants. An owner who installed the
 * dashboard got an app called "Servd" with Servd's orange tile — identical on
 * every merchant's phone, and on a partner-sold shop it was a competitor's
 * brand sitting on their home screen. Worse, it inherited the ROOT manifest,
 * whose `start_url` is `/cashier`: installing from the dashboard produced an
 * app that opened on the till.
 *
 * So the manifest is built per shop, from the slug in its own URL. The slug is
 * the storefront subdomain — already public — which is what lets this be a
 * plain GET with no session: a manifest is fetched by the browser WITHOUT
 * credentials unless the link carries `crossorigin="use-credentials"`, and
 * Next's `metadata.manifest` does not set that. Putting the identity in the
 * path is what makes a per-shop manifest possible at all.
 *
 * Pure so the shape can be tested without a request or a database.
 */

export interface MerchantAppBrand {
  name: string;
  slug: string;
  primaryColor: string | null;
}

/** First letter of the shop's name, for the monogram tile. */
export function monogram(name: string): string {
  const first = name.trim().charAt(0).toUpperCase();
  // A name that is entirely punctuation or emoji would leave a blank tile.
  return /[A-Z0-9]/.test(first) ? first : "•";
}

/**
 * A square tile: the shop's initial on the shop's colour.
 *
 * SVG because it is the only icon this deployment can generate exactly. A real
 * per-shop PNG would mean rasterising a font, and the uploaded `logoUrl` cannot
 * be used either: it is an arbitrary aspect ratio at an unknown size, and
 * declaring it in a manifest with invented dimensions produces a stretched
 * tile. A letter on a coloured square is honest, recognisable at 48px, and
 * different for every shop — which is the whole point.
 *
 * The PNG entries below it are Servd's own, for anything that cannot render an
 * SVG icon — notably iOS, which ignores the manifest entirely and reads
 * `apple-touch-icon`.
 *
 * SAFE-ZONE PADDED. A maskable icon may be cropped to a circle inscribed in the
 * middle 80%, so the letter sits at 44% of the canvas and the fill runs edge to
 * edge: a transparent corner becomes a black corner once cropped.
 */
export function monogramSvg(name: string, primaryColor: string | null): string {
  const bg = primaryColor?.trim() || SERVD_DEFAULTS.primary;
  const letter = monogram(name);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="${escapeAttr(bg)}"/>
  <text x="256" y="256" fill="#ffffff" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        font-size="225" font-weight="700" text-anchor="middle" dominant-baseline="central">${escapeText(letter)}</text>
</svg>
`;
}

/**
 * The manifest itself.
 *
 * `id` is what keeps this distinct from the three other apps this deployment
 * offers on the same scope — the cashier, the incoming-orders kiosk and the
 * partner portal. Without it a browser may treat two of them as one app and
 * quietly replace the other's icon.
 *
 * `scope` is "/" rather than "/admin", deliberately. Signing out goes to
 * `/login`; a scope of `/admin` would throw the owner into a browser tab at the
 * moment they sign out of their own app.
 */
export function merchantManifest(brand: MerchantAppBrand) {
  const theme = brand.primaryColor?.trim() || SERVD_DEFAULTS.primary;
  return {
    id: "/admin",
    name: `${brand.name} — dashboard`,
    // What fits under an icon. A long restaurant name is truncated by the
    // launcher anyway, so the short one is the name alone.
    short_name: brand.name.slice(0, 30),
    description: `Orders, menu and reports for ${brand.name}.`,
    start_url: "/admin",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: SERVD_DEFAULTS.surface,
    theme_color: theme,
    categories: ["business", "food", "productivity"],
    icons: [
      {
        src: `/m/${brand.slug}/icon.svg`,
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: `/m/${brand.slug}/icon.svg`,
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/brand/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Orders", url: "/admin/orders", description: "Today's orders" },
      { name: "Menu", url: "/admin/menu", description: "Edit the menu" },
    ],
  };
}

/** A colour comes from a database column; a name comes from an owner. */
function escapeAttr(v: string): string {
  return v.replace(/[<>"'&]/g, "");
}

function escapeText(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
