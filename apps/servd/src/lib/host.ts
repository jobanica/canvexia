/**
 * Classifies an incoming Host header relative to the platform root domain.
 * Pure + testable; middleware uses the shape, the resolver uses the parts.
 *
 *   parseHost("mango-grill.servdph.net", "servdph.net") -> { kind:"subdomain", subdomain:"mango-grill" }
 *   parseHost("order.bistro.com",        "servdph.net") -> { kind:"custom", host:"order.bistro.com" }
 *   parseHost("servdph.net",             "servdph.net") -> { kind:"platform" }
 *   parseHost("canvexia.com",  "servdph.net", "canvexia.com") -> { kind:"partner_root" }
 *   parseHost("cebu.canvexia.com", "servdph.net", "canvexia.com") -> { kind:"partner", slug:"cebu" }
 */
export type HostInfo =
  | { kind: "platform" }
  | { kind: "subdomain"; subdomain: string; host: string }
  | { kind: "custom"; host: string }
  /** A CANVEXIA partner's own domain, e.g. cebu.canvexia.com. */
  | { kind: "partner"; slug: string; host: string }
  /**
   * CANVEXIA's own front door — the bare partner root, e.g. canvexia.com.
   *
   * Distinct from `platform`, which is Servd's. They used to be the same
   * answer, because the partner root was a hypothetical domain nobody had
   * configured. Now it is real, and returning `platform` for it would serve
   * Servd's restaurant marketing at CANVEXIA's address — the partner program's
   * front page showing a page about online ordering for restaurants.
   */
  | { kind: "partner_root"; host: string };

/**
 * @param rootDomain        Where MERCHANT subdomains live (servdph.net).
 * @param partnerRootDomain Where PARTNER subdomains live (canvexia.com).
 *
 * Two roots because they answer different questions. A subdomain of the merchant
 * root is one restaurant's storefront; a subdomain of the partner root is an
 * operator's own front door, which is a portal and not a shop.
 *
 * partnerRootDomain is OPTIONAL. While it is unset, not one input produces a
 * different answer than it would without the partner arm at all — which is what
 * made adding it safe. It is now configured (canvexia.com), so that arm is live.
 */
export function parseHost(
  rawHost: string,
  rootDomain: string | undefined,
  partnerRootDomain?: string | undefined,
): HostInfo {
  const host = rawHost.split(":")[0].toLowerCase().trim();
  if (!host) return { kind: "platform" };

  // Bare localhost / loopback and Vercel previews are always platform.
  if (host === "localhost" || host === "127.0.0.1") return { kind: "platform" };
  if (host.endsWith(".vercel.app")) return { kind: "platform" };

  // Checked before the merchant root. They are different domains, so the order
  // cannot normally matter — but if the two were ever configured the same, a
  // partner slug silently resolving to "some restaurant we could not find" is a
  // worse failure than the reverse.
  if (partnerRootDomain) {
    const proot = partnerRootDomain.toLowerCase();
    // CANVEXIA's own front door, NOT Servd's. See the note on partner_root.
    if (host === proot || host === `www.${proot}`) return { kind: "partner_root", host };
    if (host.endsWith(`.${proot}`)) {
      const slug = host.slice(0, -(proot.length + 1));
      if (["www", "app", "admin", "api", "tutorials"].includes(slug)) return { kind: "platform" };
      if (slug) return { kind: "partner", slug, host };
    }
  }

  if (rootDomain) {
    const root = rootDomain.toLowerCase();
    if (host === root || host === `www.${root}`) return { kind: "platform" };
    if (host.endsWith(`.${root}`)) {
      const subdomain = host.slice(0, -(root.length + 1));
      // Reserved labels stay on the platform.
      if (["www", "app", "admin", "api", "tutorials"].includes(subdomain)) return { kind: "platform" };
      if (subdomain) return { kind: "subdomain", subdomain, host };
    } else {
      return { kind: "custom", host };
    }
  } else if (host !== "localhost") {
    return { kind: "custom", host };
  }

  return { kind: "platform" };
}
