/**
 * Where this deployment lives, for anything that shows an address to a person.
 *
 * WHY THIS EXISTS. `servdph.com` used to be written into the diner-facing badge,
 * the QR splash, the partner support link and a dozen `?? "https://servdph.com"`
 * fallbacks. That was fine while Servd was one business on one domain. CANVEXIA
 * is a separate product on a separate database, and Servd inside it runs on a
 * different domain (D31) — so a hardcoded address is a badge on somebody's
 * storefront pointing at a site this deployment does not run.
 *
 * A wrong domain is worse than no domain: the badge is the one piece of Servd a
 * diner sees, so sending them to a stranger's site is the failure to avoid.
 * Everything here therefore degrades to **absent**, never to a guess.
 *
 * Set `NEXT_PUBLIC_APP_URL` and the rest follows.
 */

/** Trim a trailing slash so callers can always append a path. */
function normalise(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * The public base URL, e.g. "https://www.example.ph".
 *
 * Returns "" when unset, which makes every link built on it RELATIVE — the page
 * links to itself. That is the right failure: an unconfigured deployment is
 * self-consistent instead of advertising a domain it has nothing to do with.
 */
export function appUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return raw ? normalise(raw) : "";
}

/** `appUrl()` with a path appended, or the bare path when unset. */
export function appLink(path = "/"): string {
  const base = appUrl();
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${suffix}` : suffix;
}

/**
 * The host on its own, for DISPLAY — "www.example.ph", no scheme, no path.
 *
 * Null when unset, so a caller renders nothing rather than an empty line where
 * an address should be.
 */
export function appHost(): string | null {
  const base = appUrl();
  if (!base) return null;
  try {
    return new URL(base).host || null;
  } catch {
    // A malformed NEXT_PUBLIC_APP_URL should not take a diner page down over a
    // decorative line of text.
    return null;
  }
}

/**
 * The domain used for SYNTHETIC staff logins — a DIY or partner-built account
 * whose owner never gave an email, which still needs a unique address to hold
 * the Supabase Auth row.
 *
 * Nothing is ever delivered here, which is exactly why it must not be a real
 * domain somebody else owns. Derived from the merchant root domain when
 * `INTERNAL_LOGIN_DOMAIN` is unset, and `staff.invalid` as the last resort —
 * `.invalid` is reserved by RFC 2606 precisely so it can never resolve.
 */
export function internalLoginDomain(): string {
  const explicit = process.env.INTERNAL_LOGIN_DOMAIN?.trim();
  if (explicit) return explicit;
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.trim();
  return root ? `staff.${root}` : "staff.invalid";
}

/** Whether an address is one of the synthetic logins above, not a real inbox. */
export function isSyntheticLogin(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${internalLoginDomain().toLowerCase()}`);
}

/**
 * The User-Agent for outbound scraping, which is a courtesy and a contact
 * point: a site owner who sees it should be able to find out who is calling.
 * Without a configured URL it identifies the tool and nothing else, rather than
 * naming a domain that has nothing to do with this deployment.
 */
export function outboundUserAgent(tool: string): string {
  const base = appUrl();
  return base ? `${tool} (+${base})` : tool;
}

/**
 * The support Messenger link shown on the public pages.
 *
 * A social handle, not a domain, but it moves with the brand for the same
 * reason and was hardcoded next to it. Falls back to the site's own contact
 * path rather than to somebody else's Facebook page.
 */
export function supportMessengerUrl(): string {
  const handle = process.env.NEXT_PUBLIC_SUPPORT_MESSENGER?.trim();
  if (!handle) return appLink("/contact");
  return handle.startsWith("http") ? handle : `https://m.me/${handle.replace(/^@/, "")}`;
}

/**
 * `metadataBase` for a Next `Metadata` export.
 *
 * Undefined when there is no configured URL — Next accepts that and resolves
 * relative metadata against the request, warning in dev. `new URL("")` throws,
 * and it throws at BUILD time while collecting page data, so the whole app
 * fails to build on a deployment that simply has not set its domain yet. The
 * build caught exactly that.
 */
export function metadataBaseUrl(): URL | undefined {
  const base = appUrl();
  if (!base) return undefined;
  try {
    return new URL(base);
  } catch {
    return undefined;
  }
}
