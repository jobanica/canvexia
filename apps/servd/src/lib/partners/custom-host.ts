/**
 * A hostname, as a person types it.
 *
 * NOT in the server-actions file, which is a `"use server"` module — every
 * export from one of those must be an async function, so a pure helper living
 * there fails the build. It is pure anyway, which makes it testable without a
 * request.
 *
 * Accepts what somebody pastes — a scheme, a trailing slash, capitals, a
 * trailing dot — and rejects what cannot be a domain. Refusing
 * "https://order.mysari.ph/" with "that is not a domain" would be technically
 * true and useless.
 */
export function normaliseHost(raw: string): string | null {
  let host = raw.trim().toLowerCase();
  host = host.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (!host) return null;
  // Labels of letters, digits and hyphens, never leading or trailing a hyphen;
  // at least one dot; a real-looking TLD.
  if (!/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/.test(host)) return null;
  if (!/\.[a-z]{2,}$/.test(host)) return null;
  return host;
}
