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
  | { kind: "custom"; host: string };

export function parseHost(rawHost: string, rootDomain: string | undefined): HostInfo {
  const host = rawHost.split(":")[0].toLowerCase().trim();
  if (!host) return { kind: "platform" };

  // Bare localhost / loopback and Vercel previews are always platform.
  if (host === "localhost" || host === "127.0.0.1") return { kind: "platform" };
  if (host.endsWith(".vercel.app")) return { kind: "platform" };

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
