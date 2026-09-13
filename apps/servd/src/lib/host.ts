/**
 * Classifies an incoming Host header relative to the platform root domain.
 * Pure + testable; middleware uses the shape, the resolver uses the parts.
 *
 *   parseHost("mango-grill.servd.app", "servd.app") -> { kind:"subdomain", subdomain:"mango-grill" }
 *   parseHost("order.bistro.com",     "servd.app") -> { kind:"custom", host:"order.bistro.com" }
 *   parseHost("servd.app",            "servd.app") -> { kind:"platform" }
 */
export type HostInfo =
  | { kind: "platform" }
  | { kind: "subdomain"; subdomain: string; host: string }
  | { kind: "custom"; host: string }
  /** A CANVEXIA partner's own domain, e.g. cebu.canvexia.app. */
  | { kind: "partner"; slug: string; host: string };

/**
 * @param rootDomain        Where MERCHANT subdomains live (servd.app).
 * @param partnerRootDomain Where PARTNER subdomains live (canvexia.app).
 *
 * Two roots because they answer different questions. A subdomain of the merchant
 * root is one restaurant's storefront; a subdomain of the partner root is an
 * operator's own front door, which is a portal and not a shop.
 *
 * partnerRootDomain is OPTIONAL and unset in production today, and that is what
 * makes this change safe: with it absent, not one input produces a different
 * answer than it did before. The partner arm switches on the day
 * NEXT_PUBLIC_PARTNER_ROOT_DOMAIN is configured, not the day this ships.
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
    if (host === proot || host === `www.${proot}`) return { kind: "platform" };
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
